const { execSync } = require("node:child_process");

const SKIP_BUILD = 0;
const RUN_BUILD = 1;

// Firebase credentials live only in the Vercel production environment: a preview build fails
// for lack of them and could only reach the production database if they were copied over.
if (process.env.VERCEL_ENV !== "production") {
    console.log(
        `Skipping build: VERCEL_ENV is "${process.env.VERCEL_ENV}", not production.`
    );
    process.exit(SKIP_BUILD);
}

const commitMessage = execSync("git log -1 --pretty=%B").toString().trim();

if (commitMessage.includes("[skip ci]")) {
    console.log("Skipping build due to [skip ci] in commit message.");
    process.exit(SKIP_BUILD);
}

process.exit(RUN_BUILD);
