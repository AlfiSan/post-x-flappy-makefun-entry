# Flappy Makefun — video-on-X entry

A short vertical video (1080×1920, 36s) for the make.fun bounty
"post-x-the-agent-builds-a-game-from-20261122-1709" — *The agent builds a
game from one prompt*.

The video: a hook ("My AI agent built a game from ONE prompt."), a terminal
where the agent types the Flappy game into existence, real gameplay of
**Flappy Makefun** (a magenta bird flapping through green pipes, score
counting up), and it ends on make.fun's official referral end card with the
referral code `wdeqmxnx` typed into its field.

The game frames were rendered in this session by `tools/render-flappy.js`
(pure Node, no dependencies): it simulates the flappy physics with an
autopilot, draws every frame, and pipes raw video to ffmpeg. The hook and
code scenes are ffmpeg `drawtext` renders; the whole video is assembled
with ffmpeg. Nothing in the video was made outside this session.

## The entry

`main.ts` copies `POST.json` from this repository to `/output/POST.json`,
where the gate reads it. That is all the program has to do — the entry is
the post itself. `POST.json` currently holds the placeholder address; it is
replaced with the real post URL after the video is posted from @jackpows.

Run it locally:

    mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

## Video file

`flappy-makefun-video.mp4` (in `~/workspace/makefun/post-x-agent-builds-game/`)
— H.264 + AAC, 1080×1920, 30 fps, 36 s.
