import * as fs from 'fs';
import axios from 'axios';
import chalk from 'chalk';
import ora = require('ora');
import Listr = require('listr');
import { v4 as uuid } from 'uuid';
import { getLastCommit } from 'git-last-commit';
import LocalWebServer = require('local-web-server');
import browserStackLocal = require('browserstack-local');

// Define the browsers that we are going to be testing
let platforms =
[
    { os: "Windows", os_version: "7", browser: "ie", browser_version: "8.0" },
    { os: "Windows", os_version: "7", browser: "ie", browser_version: "9.0" },
    { os: "Windows", os_version: "8", browser: "ie", browser_version: "10.0" },
    { os: "Windows", os_version: "10", browser: "ie", browser_version: "11.0" },
    { os: "OS X", os_version: "Snow Leopard", browser: "safari", browser_version: "5.1" },
    { os: "OS X", os_version: "Lion", browser: "safari", browser_version: "6.0" },
    { os: "OS X", os_version: "Mountain Lion", browser: "safari", browser_version: "6.2" },
    { os: "OS X", os_version: "Mavericks", browser: "safari", browser_version: "7.1" },
    { os: "OS X", os_version: "Yosemite", browser: "safari", browser_version: "8.0" },
    { os: "OS X", os_version: "El Capitan", browser: "safari", browser_version: "9.1" },
    { os: "OS X", os_version: "Sierra", browser: "safari", browser_version: "10.1" },
    { os: "OS X", os_version: "High Sierra", browser: "safari", browser_version: "11.0" }
];

// This our build number, so we can easily group tests
const BUILD_NO = Date.now();

// This is the URL that browser stack will instruct each browser to open.
const TEST_URL = 'http://localhost:8000/tests/bs-runner.html';

// How long we will wait for a test job to run
const TEST_TIMEOUT = 300000;

// How often we poll browser stack to get the status of our tests
const STATUS_CHECK_THROTTLE = 1000;

// Read in the package json so we can use it for various metadata purposes.
let pkg = require(`${__dirname}/../package.json`);

// Grab the last commit details
// By the time we actually need this it should have well and truely returned.
let gitCommit: any = {}; getLastCommit((err, commit) => gitCommit = commit);

// Create a new axios instance configured to talk to browser stack.
let bsRestClient = axios.create
({
    baseURL: `https://api.browserstack.com/4`,
    auth:
    {
        username: process.env['BROWSERSTACK_USERNAME'],
        password: process.env['BROWSERSTACK_ACCESS_KEY']
    }
});

// Helper to grab the current build id
let buildId = null;
async function getBuildId()
{
    if (buildId !== null) return buildId;

    let response = await bsRestClient.get('https://www.browserstack.com/automate/builds.json');

    for (let build of response.data)
    {
        if (build.automation_build.name.includes(BUILD_NO))
        {
            buildId = build.automation_build.hashed_id;
            return buildId;
        }
    }
}

// Helper that gets all sessions for the current build
let sessions = null;
async function getSessionsForBuild()
{
    if (sessions !== null) return sessions;
    let response = await bsRestClient.get(`https://www.browserstack.com/automate/builds/${await getBuildId()}/sessions.json`);
    sessions = response.data;
    return sessions;
}

// Helper that returns a session based on it's name
// NOTE: We use a UUID as the session name so it looks just like another id.
async function getSessionByName(name: string)
{
    let sessions = await getSessionsForBuild();

    for (let session of sessions)
    {
        if (session.automation_session.name === name)
        {
            return session.automation_session;
        }
    }

    throw new Error('Could not find session!');
}

// Updates a session, used to mark a test as passed or failed.
async function updateSessionByName(name: string, updates: { [k: string]: any })
{
    let session = await getSessionByName(name);

    await bsRestClient.put
    (
        `https://www.browserstack.com/automate/sessions/${session.hashed_id}.json`,
        updates
    );
}

// Some additional shared context
// TODO: Refactor to use the actual Listr context
let testResults = {}, runningTests = {}, completedSessions = {};

new Listr
([
    {
        title: 'Start local web server',
        task: (ctx) =>
        {
            let httpServer = new LocalWebServer();
            ctx.server = httpServer.listen
            ({
                port: 8000,
                //https: true, TODO: Figure out how browser stack handles ssl
                directory: fs.realpathSync(`${__dirname}/..`),
                stack:
                [
                    'lws-body-parser',
                    'lws-request-monitor',
                    LwsMiddleWare => class BsMiddleware extends LwsMiddleWare
                    {
                        middleware (options)
                        {
                            return async (ctx, next) =>
                            {
                                if (ctx.request.method === 'POST')
                                {
                                    let sessionName = ctx.request.headers['x-bs-session-name'];

                                    switch (ctx.request.path)
                                    {
                                        case '/__test.start':

                                            runningTests[sessionName] = ctx.request.body;

                                        return;

                                        case '/__test.complete':

                                            if (typeof testResults[sessionName] === 'undefined')
                                            {
                                                testResults[sessionName] = [];
                                            }

                                            testResults[sessionName].push(ctx.request.body);

                                        return;

                                        case '/__tests.complete':

                                            await updateSessionByName(sessionName,
                                            {
                                                status: ctx.request.body.failed > 0 ? 'failed' : 'passed'
                                            });

                                            completedSessions[sessionName] = ctx.request.body;

                                        return;
                                    }
                                }

                                await next();
                            }
                        }
                    },
                    'lws-static'
                ]
            });
        }
    },
    {
        title: 'Start bs tunnel',
        task: (ctx) => new Promise((resolve, reject) =>
        {
            ctx.tunnel = new browserStackLocal.Local();
            ctx.tunnel.start
            ({
                onlyAutomate: true,
                force: true,
                verbose: true,
                logFile: `${__dirname}/../bsLocal.log`
            }, resolve);
        })
    },
    {
        title: 'Enqueuing test jobs',
        task: async (ctx) =>
        {
            ctx.jobs = [];

            for (let platform of platforms)
            {
                let sessionName = uuid();

                let request = Object.assign
                ({
                    url: encodeURI(`${TEST_URL}?sessionName=${sessionName}`),
                    name: sessionName,
                    project: pkg.name,
                    build: `${BUILD_NO} - ${gitCommit.shortHash} - ${gitCommit.subject}`,
                    timeout: TEST_TIMEOUT / 1000,
                    browserstack: { video: true }
                }, platform);

                try
                {
                    let response = await bsRestClient.post('worker', request);
                    ctx.jobs.push({ sessionName: sessionName, jobId: response.data['id'], platform: platform });
                }
                catch (e)
                {
                    throw new Error(`${e.response.status}: ${e.response.statusText} - ${JSON.stringify(e.response.data)}`);
                }
            }
        }
    },
    {
        title: 'Running tests',
        task: (ctx) => new Listr
        (
            ctx.jobs.map(job =>
            {
                let platformString = `${job.platform.os} ${job.platform.os_version}, ${job.platform.browser} ${job.platform.browser_version}`;
                let title = `${job.jobId} - ${job.sessionName} - ${platformString}`;

                return {
                    title: title,
                    task: (ctx, task) => new Promise((resolve, reject) =>
                    {
                        let startTime = null;

                        // Update the status with any currently running tests
                        let updateRunningTests = setInterval(() =>
                        {
                            if (typeof runningTests[job.sessionName] !== 'undefined')
                            {
                                let runningTest = runningTests[job.sessionName];
                                let newTitle = `${job.jobId} - ${job.sessionName} - ${platformString} - running test ${runningTest['name']}`;
                                if (title != newTitle) { title = newTitle; task.title = title; }
                            }
                        }, 0);

                        // Run a settimeout loop until the job either complete or timesout.
                        let getStatus = () =>
                        {
                            // Terminate any wokers that have reported back to say they have been completed
                            if (typeof completedSessions[job.sessionName] !== 'undefined')
                            {
                                clearInterval(updateRunningTests);

                                bsRestClient.delete(`worker/${job.jobId}`).catch(e =>
                                {
                                    /* swallow any failed request errors, we will just be retrying very soon anyway */
                                });

                                let newTitle = `${job.jobId} - ${job.sessionName} - ${platformString} - waiting for session to close`;
                                if (title != newTitle) { title = newTitle; task.title = title; }
                            }

                            bsRestClient.get(`worker/${job.jobId}`).then(response =>
                            {
                                // An empty response means the job has completed
                                if (Object.getOwnPropertyNames(response.data).length === 0)
                                {
                                    if (typeof completedSessions[job.sessionName] !== 'undefined')
                                    {
                                        if (completedSessions[job.sessionName].failed > 0)
                                        {
                                            reject({ job: job, results: testResults[job.sessionName] });
                                            return;
                                        }
                                        else
                                        {
                                            resolve();
                                            return;
                                        }
                                    }

                                    setTimeout(getStatus, STATUS_CHECK_THROTTLE);
                                    return;
                                }

                                // Grab some data out of the response
                                let status = response.data['status'];

                                // Update the title of the task
                                if (!title.includes('running test') && !title.includes('waiting for session to close'))
                                {
                                    let newTitle = `${job.jobId} - ${job.sessionName} - ${platformString} - ${status}`;
                                    if (title != newTitle) { title = newTitle; task.title = title; }
                                }

                                // Only start timing once the job actually starts
                                if (status === 'running' && startTime === null)
                                {
                                    startTime = Date.now();
                                }

                                // Either check for a timeout or queue the next execution of this method
                                if (startTime !== null && ((Date.now() - startTime) > TEST_TIMEOUT))
                                {
                                    reject({ job: job, results: 'Timed out waiting for test to complete.' });
                                }
                                else
                                {
                                    setTimeout(getStatus, STATUS_CHECK_THROTTLE);
                                }
                            })
                            .catch(e => { /* swallow any failed status request errors, we will just be retrying very soon anyway */ });
                        };

                        setTimeout(getStatus, STATUS_CHECK_THROTTLE);
                    })
                };
            }),
            { concurrent: true, exitOnError: false }
        )
    },
    {
        title: 'Shutdown bs tunnel',
        task: (ctx) => new Promise(resolve =>
        {
            ctx.tunnel.stop(resolve);
        })
    },
    {
        title: 'Shutdown local web server',
        task: (ctx) => new Promise(resolve =>
        {
            ctx.server.close(resolve);
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
            console.error(chalk.gray(`${JSON.stringify(error['job'])}`));
            console.error(chalk.red(JSON.stringify(error['results'].filter(_ => !_.result), undefined, 4)));
            console.error();
        }
    }
    else
    {
        console.error(e);
    }

    process.exit(1);
});
