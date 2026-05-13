const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const FILE_EXTENSIONS = new Set([
    '.apng',
    '.avif',
    '.bmp',
    '.gif',
    '.ico',
    '.jpeg',
    '.jpg',
    '.png',
    '.svg',
    '.tif',
    '.tiff',
    '.webp',
]);
const MAX_URLS_PER_REQUEST = 30;
function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}
function git(args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}
function resolveDiffRange() {
    const before = process.env.GITHUB_EVENT_BEFORE;
    const after = process.env.GITHUB_SHA || 'HEAD';
    if (!before || /^0{40}$/.test(before)) {
        return [git(['hash-object', '-t', 'tree', '/dev/null']), after];
    }
    return [before, after];
}
function getChangedFilePaths() {
    const [before, after] = resolveDiffRange();
    const output = git(['diff', '--name-only', '--diff-filter=ACDMRT', before, after]);
    if (!output) {
        return [];
    }
    const paths = output
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => FILE_EXTENSIONS.has(path.posix.extname(item).toLowerCase()));
    return [...new Set(paths)].sort();
}
function getBaseUrl() {
    const configuredBaseUrl = process.env.PURGE_BASE_URL;
    if (configuredBaseUrl) {
        return configuredBaseUrl.replace(/\/+$/, '');
    }
    const cname = readFileSync('CNAME', 'utf8').trim();
    if (!cname) {
        throw new Error('CNAME is empty! Please fill it in or set PURGE_BASE_URL explicitly.');
    }
    return `https://${cname.replace(/\/+$/, '')}`;
}
function pathToUrl(baseUrl, filePath) {
    return `${baseUrl}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}
function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}
async function purgeUrls(zoneId, apiToken, urls) {
    for (const batch of chunk(urls, MAX_URLS_PER_REQUEST)) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ files: batch }),
        });
        const text = await response.text();
        let body;
        try {
            body = JSON.parse(text);
        } catch {
            throw new Error(`Cloudflare returned non-JSON response: ${text}`);
        }
        if (!response.ok || !body.success) {
            throw new Error(`Cloudflare purge failed: ${JSON.stringify(body)}`);
        }
        console.log(`Purged ${batch.length} URL(s). Request id: ${body.result?.id || 'unknown'}`);
    }
}
async function main() {
    const baseUrl = getBaseUrl();
    const changedPaths = getChangedFilePaths();
    if (changedPaths.length === 0) {
        console.log('No changed media files found. Nothing to purge.');
        return;
    }
    const zoneId = requiredEnv('CLOUDFLARE_ZONE_ID');
    const apiToken = requiredEnv('CLOUDFLARE_API_TOKEN');
    const urls = changedPaths.map((item) => pathToUrl(baseUrl, item));
    console.log(`Found ${urls.length} changed media URL(s):`);
    for (const url of urls) {
        console.log(`- ${url}`);
    }
    await purgeUrls(zoneId, apiToken, urls);
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
