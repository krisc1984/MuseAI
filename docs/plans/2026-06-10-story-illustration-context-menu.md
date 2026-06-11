# Story Illustration Context Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users select a text block in the Markdown editor, right-click to generate a story illustration, preview/edit the generated prompt, and then generate and insert the illustration using matched character main images as references when available.

**Architecture:** Extend the shared `MarkdownEditor` so the capability is available in writing surfaces that already use it. Add a lightweight illustration modal plus a small prompt-matching utility layer. When the user confirms generation, save the returned image into the current document directory and insert a Markdown image block near the selected text.

**Tech Stack:** React, Ant Design, CodeMirror, Zustand stores, Tauri FS commands, Vitest, existing image generation utility.

---

### Task 1: Capture selected text and expose a context-menu entry

**Files:**
- Modify: `src/components/MarkdownEditor.tsx`
- Test: `src/__tests__/markdown-editor.test.tsx`

**Step 1: Write the failing test**

Add a test that renders `MarkdownEditor`, selects text in the test textarea fallback, opens a context menu, and expects a `生成剧情插图` action to appear only when there is a non-empty selection.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/markdown-editor.test.tsx`

Expected: FAIL because the context-menu action does not exist.

**Step 3: Write minimal implementation**

In `MarkdownEditor.tsx`:
- track selected editor text
- add a right-click menu anchored to the editor shell
- show `生成剧情插图` only for writable Markdown files with non-empty selection

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/markdown-editor.test.tsx`

Expected: PASS for the new context-menu behavior.

### Task 2: Build prompt preview and character reference matching

**Files:**
- Create: `src/utils/storyIllustrationPrompt.ts`
- Modify: `src/components/MarkdownEditor.tsx`
- Test: `src/__tests__/story-illustration-prompt.test.ts`

**Step 1: Write the failing test**

Add utility tests for:
- generating a default illustration prompt from selected story text
- matching character cards by selected text content
- preferring cards with `visualImage` as reference images

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/story-illustration-prompt.test.ts`

Expected: FAIL because the utility does not exist.

**Step 3: Write minimal implementation**

Create `storyIllustrationPrompt.ts` with helpers to:
- normalize character names
- detect mentioned characters from `usePartnerStore` character cards
- build a prompt preview string for “剧情插图”
- return reference images from matched character main images

Use the helper in `MarkdownEditor.tsx` to populate a modal textarea before generation.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/story-illustration-prompt.test.ts`

Expected: PASS.

### Task 3: Generate image, save it beside the document, and insert Markdown

**Files:**
- Modify: `src/utils/openaiImageGeneration.ts`
- Modify: `src/components/MarkdownEditor.tsx`
- Modify: `src-tauri/src/commands/fs.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src/__tests__/openai-image-generation.test.ts`
- Test: `src/__tests__/markdown-editor.test.tsx`

**Step 1: Write the failing tests**

Add tests for:
- multiple reference images being forwarded to the image generation request
- generated story illustration being written to disk and inserted into markdown after confirmation

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/openai-image-generation.test.ts src/__tests__/markdown-editor.test.tsx`

Expected: FAIL because multi-image refs and save/insert flow do not exist.

**Step 3: Write minimal implementation**

- extend `generateOpenAIImage` to accept `image: string | string[]`
- add a Tauri command to write a data URL or remote image response into a PNG/JPG file
- in `MarkdownEditor.tsx`, after generation:
  - save image into the current file directory under an illustrations subpath
  - insert `![剧情插图-时间戳](relative/path.png)` after the selected block or selection end

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/openai-image-generation.test.ts src/__tests__/markdown-editor.test.tsx`

Expected: PASS.

### Task 4: Polish the modal flow and verify end to end

**Files:**
- Modify: `src/components/MarkdownEditor.tsx`
- Modify: `src/App.css`
- Test: `src/__tests__/markdown-editor.test.tsx`

**Step 1: Write the failing test**

Add a UI test covering:
- prompt preview textarea is editable
- matched reference role names are shown
- generation stays disabled while prompt is empty

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/markdown-editor.test.tsx`

Expected: FAIL because the modal polish is incomplete.

**Step 3: Write minimal implementation**

- show prompt preview modal with editable textarea
- show detected character references and thumbnail preview labels
- disable generate button when prompt is blank
- add minimal styling for the preview area

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/markdown-editor.test.tsx`

Expected: PASS.

### Task 5: Final verification

**Files:**
- Test: `src/__tests__/story-illustration-prompt.test.ts`
- Test: `src/__tests__/openai-image-generation.test.ts`
- Test: `src/__tests__/markdown-editor.test.tsx`

**Step 1: Run focused tests**

Run: `npm test -- src/__tests__/story-illustration-prompt.test.ts src/__tests__/openai-image-generation.test.ts src/__tests__/markdown-editor.test.tsx`

Expected: PASS.

**Step 2: Run full build**

Run: `npm run build`

Expected: PASS.
