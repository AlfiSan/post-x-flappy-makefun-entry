// Flappy Makefun — entry program for the video-on-X bounty.
//
// The video and the X post are the entry itself. This program does one
// small job for the gate: it takes the post's address out of POST.json in
// this repository and drops it into the output directory, where the house
// picks it up and checks the post on X (views, likes, reposts, quotes,
// replies). Nothing this program writes is scored — only the post is.
//
// It runs the way the grader runs it:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
// and stays silent on success.
//
// Node 22, standard library only. No network, no clock, no files
// outside this repository.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const repoRoot = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const postIn = `${repoRoot}/POST.json`;
const postOut = `${outDir}/POST.json`;

// Bail out early if the post file is missing — a silent wrong answer
// would be worse than a loud failure.
if (!existsSync(postIn)) {
  console.error(`POST.json is missing, looked for it at ${postIn}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

try {
  const postText = readFileSync(postIn, 'utf8');
  writeFileSync(postOut, postText, 'utf8');
} catch (err) {
  console.error(`failed to hand POST.json over to ${postOut}: ${(err as Error).message}`);
  process.exit(1);
}
