import * as fs from 'fs';
import axios from 'axios';
import chalk from 'chalk';
import ora = require('ora');
import Listr = require('listr');
import { getLastCommit } from 'git-last-commit';
import LocalWebServer = require('local-web-server');
import sauceConnectLauncher = require('sauce-connect-launcher');

// Define the browsers that we are going to be testing
let platforms =
[
    ['Windows 7', 'internet explorer', '8.0'],
    ['Windows 7', 'internet explorer', '9.0'],
    ['Windows 8', 'internet explorer', '10.0'],
    ['Windows 10', 'internet explorer', '11.0'],
    ['OS X 10.9', 'safari', '7'],
    ['OS X 10.10', 'safari', '8'],
    ['OS X 10.11', 'safari', '9'],
    ['macOS 10.12', 'safari', '10'],
    ['macOS 10.12', 'safari', '11'],
    ['Linux', 'firefox', ''],
    ['Linux', 'chrome', '']
];

// This our build number, so we can easily group tests
const BUILD_NO = Date.now();

// This is the URL that saucelabs will instruct each browser to open.
const TEST_URL = 'http://localhost:8000/tests/sl-runner.html';

// How long we will wait for a test job to run
const TEST_TIMEOUT = 120000;

// How often we poll saucelabs to get the status of our tests
const STATUS_CHECK_THROTTLE = 1000;

// The number of jobs we will run in parallel.
// NOTE: Sauce Connect seems to be a bottle neck, on slow links (ie: at home),
// you will probably run into odd issues.
const CONCURRENT_JOBS = process.env['CI'] === 'true' ? 4 : 1;

// Read in the package json so we can use it for various metadata purposes.
let pkg = require(`${__dirname}/../package.json`);

// Grab the last commit details
// By the time we actually need this it should have well and truely returned.
let gitCommit: any = {}; getLastCommit((err, commit) => gitCommit = commit);

// Create a new axios instance configured to talk to sauce labs.
let sauceRestClient = axios.create
({
    baseURL: `https://saucelabs.com/rest/v1/${process.env['SAUCE_USERNAME']}/`,
    auth:
    {
        username: process.env['SAUCE_USERNAME'],
        password: process.env['SAUCE_ACCESS_KEY']
    }
});

new Listr
([
    {
        title: 'Start local web server',
        task: (ctx) =>
        {
            ctx.httpServer = (new LocalWebServer()).listen
            ({
                port: 8000,
                directory: fs.realpathSync(`${__dirname}/..`),
                stack:
                [
                    LwsMiddleWare => class RedirectToHttps extends LwsMiddleWare
                    {
                        middleware (options)
                        {
                            return async (ctx, next) =>
                            {
                                // MacOs / Safari at Sauce Labs do not like the self signed cert.
                                // In theory the SSL Bumping feature of SC, is meant to solve that,
                                // certianly appears to for IE and others. Just not the Mac tests.
                                // Anyway it really only IE that needs SSL because of "XDomainRequest".
                                if (ctx.request.headers['user-agent'].indexOf('Mac OS X') > -1)
                                {
                                    await next();
                                }
                                else
                                {
                                    ctx.redirect(TEST_URL.replace('http://', 'https://').replace('8000', '8080'));
                                }
                            }
                        }
                    },
                    'lws-static'
                ]
            });

            ctx.httpsServer = (new LocalWebServer()).listen
            ({
                port: 8080,
                https: true,
                directory: fs.realpathSync(`${__dirname}/..`),
                stack: ['lws-static']
            });
        }
    },
    {
        title: 'Start sauce tunnel',
        task: (ctx) => new Promise((resolve, reject) =>
        {
            sauceConnectLauncher({ directDomains: ['code.jquery.com', 'cdn.polyfill.io'] }, (error, tunnel) =>
            {
                if (error)
                {
                    reject(error);
                }
                else
                {
                    ctx.tunnel = tunnel;
                    resolve();
                }
            });
        })
    },
    {
        title: 'Running tests',
        task: (ctx) => new Listr
        (
            platforms.map(platform =>
            {
                let platformString = platform.join(' ');

                return {
                    title: platformString,
                    task: (ctx, task) => new Promise((resolve, reject) =>
                    {
                        let updateTitle = (newTitle: string) =>
                        {
                            if (newTitle != task.title)
                            {
                                task.title = newTitle;
                            }
                        };

                        sauceRestClient.post('js-tests',
                        {
                            name: pkg.name,
                            framework: 'qunit',
                            url: TEST_URL,
                            platforms: [platform]
                        })
                        .then(jobResponse =>
                        {
                            let startTime = null;
                            let jobId = jobResponse.data['js tests'][0];
                            let statusJobId = null;
                            updateTitle(`${platformString}, jobId: ${jobId}`);

                            let getStatus = setInterval(() =>
                            {
                                // Check for a timeout
                                if (startTime !== null && ((Date.now() - startTime) > TEST_TIMEOUT))
                                {
                                    clearInterval(getStatus);
                                    updateTitle(`${platformString}, jobId: ${statusJobId}, status: Timed out waiting for test to complete.`);
                                    sauceRestClient.put(`jobs/${statusJobId}/stop`)
                                    .then(_ => { reject({jobId: statusJobId, platform: platform, results: 'Timed out waiting for test to complete.'}); })
                                    .catch(_ => { reject({jobId: statusJobId, platform: platform, results: 'Timed out waiting for test to complete.'}); });
                                    return;
                                }

                                sauceRestClient.post('js-tests/status', {'js tests': [jobId]})
                                .then(statusResponse =>
                                {
                                    let statusInfo = statusResponse.data['js tests'][0];
                                    statusJobId = statusInfo['job_id'];
                                    let status = statusInfo['status'];

                                    // Only start timing once the job actually starts
                                    if (status === 'test session in progress' && startTime === null)
                                    {
                                        startTime = Date.now();
                                    }

                                    // Update the title of the task with the job status
                                    updateTitle(`${platformString}, jobId: ${statusJobId}, status: ${typeof status === 'undefined' ? 'waiting for job to finish' : status}`);

                                    // If the test errors for some reason, then bail out early
                                    if (status === 'test error')
                                    {
                                        clearInterval(getStatus);
                                        reject({jobId: statusJobId, platform: platform, results: 'Unknown Test Error, check sauce configuration.'});
                                        return;
                                    }

                                    // Check if the job has been completed
                                    if (statusResponse.data['completed'] === true)
                                    {
                                        clearInterval(getStatus);
                                        let result = statusInfo['result'];

                                        // Log the git commit hash and message against the job once it is complete
                                        // This is so we can easily tie it back to a commit and it nicelyt groups the tests too.
                                        sauceRestClient.put(`jobs/${statusInfo['job_id']}`, { build: BUILD_NO, tags: [ gitCommit.hash, gitCommit.subject ]}).then(_ =>
                                        {
                                            if (typeof result['failed'] !== 'undefined' && result['failed'] > 0)
                                            {
                                                reject({jobId: statusJobId, platform: platform, results: result});
                                            }
                                            else
                                            {
                                                resolve();
                                            }
                                        })
                                        .catch(e =>
                                        {
                                            reject({jobId: statusJobId, platform: platform, results: 'Job completed but failed to tag with git commit.'});
                                        });
                                    }
                                })
                                .catch(e =>
                                {
                                    // swallow any failed status request errors,
                                    // we will just be retrying very soon anyway
                                });
                            }, STATUS_CHECK_THROTTLE);
                        })
                        .catch(reject);
                    })
                };
            }),
            { concurrent: CONCURRENT_JOBS, exitOnError: false }
        )
    },
    {
        title: 'Shutdown sauce tunnel',
        task: (ctx) => new Promise(resolve =>
        {
            ctx.tunnel.close(resolve);
        })
    },
    {
        title: 'Shutdown local web server',
        task: (ctx) => new Promise(resolve =>
        {
            ctx.httpServer.close(() =>
            {
                ctx.httpsServer.close(resolve);
            });
        })
    }
],{
    renderer: process.env['CI'] === 'true' ? 'verbose' : 'default'
})
.run()
.catch(e =>
{
    console.error();

    if (e['errors'])
    {
        console.error(chalk.bgRed.whiteBright('Some Tests Have Failed!'));
        console.error();

        for (let error of e['errors'])
        {
            console.error(chalk.gray(`${error['jobId']} - ${JSON.stringify(error['platform'])}`));
            console.error(chalk.red(JSON.stringify(error['results'], undefined, 4)));
            console.error();
        }
    }
    else
    {
        console.error(e);
    }

    process.exit(1);
});
