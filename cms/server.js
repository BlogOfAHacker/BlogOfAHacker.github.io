require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static('public'));

// Paths
const REPO_DIR = path.join(__dirname, '..');
const DRAFTS_DIR = path.join(REPO_DIR, '_drafts');
const POSTS_DIR = path.join(REPO_DIR, '_posts');

// Git config from .env
const GIT_URL = process.env.GIT_URL;
const GIT_EMAIL = 'someone@somewhere.com';
const GIT_USER = 'BlogOfAHacker';

// Ensure directories exist
if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR);
if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR);

// Helper: Run git command
function runGit(command, ignoreError = false) {
    try {
        const result = execSync(command, { cwd: REPO_DIR, stdio: 'pipe', encoding: 'utf-8' });
        return { success: true, output: result };
    } catch (err) {
        if (!ignoreError) console.error('Git error:', err.message);
        return { success: false, error: err.message };
    }
}

// Helper: Configure git identity
function configureGit() {
    runGit(`git config user.email "${GIT_EMAIL}"`);
    runGit(`git config user.name "${GIT_USER}"`);
    if (GIT_URL) {
        runGit(`git remote set-url origin ${GIT_URL}`);
    }
}

// Helper: Standard commit and push
function gitCommitAndPush(message) {
    configureGit();
    const branchResult = runGit('git rev-parse --abbrev-ref HEAD');
    const branch = branchResult.success ? branchResult.output.trim() : 'main';
    runGit('git add -A');
    runGit(`git commit -m "${message}"`, true);
    return runGit(`git push -u origin ${branch}`);
}

// Helper: Purge history - squash everything into one commit
function purgeHistory(commitMessage = 'Fresh start') {
    configureGit();

    // Get current branch name
    const branchResult = runGit('git rev-parse --abbrev-ref HEAD');
    const branch = branchResult.success ? branchResult.output.trim() : 'main';

    // Create orphan branch (no history)
    runGit('git checkout --orphan temp_branch');

    // Add all files
    runGit('git add -A');

    // Commit
    runGit(`git commit -m "${commitMessage}"`);

    // Delete old branch
    runGit(`git branch -D ${branch}`, true);

    // Rename temp to main branch
    runGit(`git branch -m ${branch}`);

    // Force push (this overwrites remote history)
    const pushResult = runGit(`git push -f origin ${branch}`);

    return pushResult.success;
}

// Routes

// Get config (exposes API keys to frontend)
app.get('/api/config', (req, res) => {
    res.json({
        tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
    });
});

// Get all files
app.get('/api/files', (req, res) => {
    const drafts = fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.md')).map(file => ({
        name: file,
        type: 'draft',
        path: path.join(DRAFTS_DIR, file)
    }));

    const posts = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).map(file => ({
        name: file,
        type: 'post',
        path: path.join(POSTS_DIR, file)
    }));

    res.json([...drafts, ...posts]);
});

// Get file content
app.get('/api/file', (req, res) => {
    const filePath = req.query.path;
    if (!filePath.startsWith(DRAFTS_DIR) && !filePath.startsWith(POSTS_DIR)) {
        return res.status(403).send("Access denied");
    }

    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ content });
    } else {
        res.status(404).send("File not found");
    }
});

// Save draft (no git push)
app.post('/api/save', (req, res) => {
    let { filename, content, type } = req.body;

    let targetDir = DRAFTS_DIR;
    if (type === 'post') targetDir = POSTS_DIR;

    filename = filename.replace(/[^a-zA-Z0-9-.]/g, '-');
    if (!filename.endsWith('.md')) filename += '.md';

    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, content);
    res.json({ status: 'success', path: filePath });
});

// Publish (commit + push)
app.post('/api/publish', (req, res) => {
    const { filename, content } = req.body;

    const date = new Date().toISOString().split('T')[0];
    let newFilename = `${date}-${filename}`;
    newFilename = newFilename.replace(/^\d{4}-\d{2}-\d{2}-(\d{4}-\d{2}-\d{2}-)?/, `${date}-`);

    const draftPath = path.join(DRAFTS_DIR, filename);
    const postPath = path.join(POSTS_DIR, newFilename);

    fs.writeFileSync(postPath, content);

    if (fs.existsSync(draftPath)) {
        fs.unlinkSync(draftPath);
    }

    const title = filename.replace('.md', '').replace(/-/g, ' ');
    gitCommitAndPush(`Publish: ${title}`);

    res.json({ status: 'success', newPath: postPath });
});

// Unpublish (move to draft + purge history)
app.post('/api/unpublish', (req, res) => {
    const { filename } = req.body;

    const postPath = path.join(POSTS_DIR, filename);
    let draftFilename = filename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    const draftPath = path.join(DRAFTS_DIR, draftFilename);

    if (fs.existsSync(postPath)) {
        const content = fs.readFileSync(postPath, 'utf-8');
        fs.writeFileSync(draftPath, content);
        fs.unlinkSync(postPath);

        // Purge history to remove the unpublished post from git history
        const title = draftFilename.replace('.md', '').replace(/-/g, ' ');
        purgeHistory(`Blog update`);

        res.json({ status: 'success', newPath: draftPath });
    } else {
        res.status(404).send("Post not found");
    }
});

// Delete file (+ purge history for published posts)
app.post('/api/delete', (req, res) => {
    const { filepath, type } = req.body;

    if (!filepath.startsWith(DRAFTS_DIR) && !filepath.startsWith(POSTS_DIR)) {
        return res.status(403).send("Access denied");
    }

    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);

        // If deleting a published post, purge entire history
        if (type === 'post') {
            purgeHistory('Blog update');
        }

        res.json({ status: 'success' });
    } else {
        res.status(404).send("File not found");
    }
});

// Manual fresh start - purge all history
app.post('/api/fresh-start', (req, res) => {
    const success = purgeHistory('Fresh start');

    if (success) {
        res.json({ status: 'success', message: 'History purged successfully' });
    } else {
        res.status(500).json({ status: 'error', message: 'Failed to purge history' });
    }
});

app.listen(PORT, () => {
    console.log(`CMS running at http://localhost:${PORT}`);
    import('open').then(open => open.default(`http://localhost:${PORT}`));
});
