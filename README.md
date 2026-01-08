# Cyber Chronicles Blog

A minimalistic, grid-layout Jekyll theme for GitHub Pages.

## How to use

### 1. Creating a new post
1.  Create a file in `_posts` named `YYYY-MM-DD-your-title.md`.
2.  Add the front matter at the top:
    ```yaml
    ---
    layout: post
    title: "Your Title"
    date: YYYY-MM-DD HH:MM:SS
    ---
    ```
3.  Write your content in Markdown.

### 2. Working with drafts
1.  Create a file in `_drafts` (e.g., `my-draft.md`).
2.  It will **not** appear on the live site.
3.  To publish, simply move the file to `_posts` and rename it with the date prefix (e.g., `2024-01-01-my-draft.md`).

### 3. Local Development (Optional)
If you have Ruby installed:
```bash
bundle install
bundle exec jekyll serve --drafts
```
The `--drafts` flag allows you to preview drafts locally.
