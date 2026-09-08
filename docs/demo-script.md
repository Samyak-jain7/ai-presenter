# Two-to-three-minute demo

## Prepare

Run `npm run dev`, open http://127.0.0.1:5173 in Chrome, and use headphones. Confirm `.env` is configured without showing it on camera. Close other voice assistants. Record the browser and microphone; enable system-audio capture if your recording tool supports it. Keep AI Studio and terminals containing credentials off-screen.

## Record

1. **0:00 — Introduce the app.** “This is a voice presenter with a fixed six-slide deck. It can narrate, handle interruptions, and navigate by the meaning of a question.” Show the slide list and controls.
2. **0:15 — Start narration.** Select slide 2 and click Start presentation. Allow microphone access if prompted. Let a sentence begin.
3. **0:30 — Interrupt across topics.** Say “How do interruptions work?” Show narration stopping and slide 5 appearing. Let the answer finish.
4. **0:55 — Adapt the answer.** Say “Explain this slide like I’m ten.” Let the simpler answer play, showing that slide 5 stays selected.
5. **1:20 — Silent navigation.** Say “Switch to slide six.” Pause briefly so the reviewer can see that it switches without narrating.
6. **1:35 — Explicit explanation.** Say “Switch to slide three and explain it.” Let part of the answer play.
7. **1:55 — Resume and controls.** Say “Resume the presentation.” Show microphone mute/unmute and End session. Confirm the UI returns to idle.
8. **2:20 — Close.** “The frontend is React and TypeScript. A local Node backend protects the API key and validates slide navigation. The model is Gemini 3.1 Flash Live. Uploads and generated decks are outside this prototype.”

## Before submission

Watch the recording once: both your question and the presenter's answer must be audible, the slide change must be visible, and no credentials should appear. If speech recognition mishears a question, make a fresh recording rather than describing a failed interaction as a pass.

The recording is optional. The runnable source ZIP and README are the primary deliverables.
