# Verification and limitations

## Evidence scope

The checks distinguish deterministic tests, browser simulation, real-provider synthetic-speech tests, and user observations. Synthetic tests are not a substitute for every possible microphone, accent, room, or network condition.

| Area | Evidence |
| --- | --- |
| Six complete slides and navigation boundaries | Node state tests |
| Active and queued audio cancellation, stale epochs | Node playback tests |
| Local speech-start and end detection | Node detector test and browser worklet test |
| Silent switch, one-slide explanation, explicit resume | State/session tests and real Gemini synthetic speech |
| Same-slide explanation after interruption | No-tool regression test; real Gemini answered with a simple car-conversation analogy |
| Controls, repeated interruptions, mute and two clean restarts | Isolated Chrome scenarios; track cleanup asserted |
| Playback drain before automatic advancement through all six slides | Browser simulation |
| Microphone denial and provider quota error UI | Controlled browser failures |
| Credential precedence and missing-key handling | Node configuration tests using fake keys |
| Real Gemini 3.1 audio and tool use | Bounded live probe passed |
| Real spoken interrupt to relevant slide | Synthetic PCM through actual backend/provider passed |
| Human microphone behavior | User reported interruption and adapted explanation working after fixes; not a formal all-device study |

The automated suite contains nine Node tests and five browser scenarios at packaging time. Commands and the exact clean-copy verification result are printed by `npm run verify:delivery`; this command runs no live provider calls.

## Known limits

- The deck is fixed. PDF/PowerPoint upload and slide generation are not included.
- English and desktop Chrome are the tested baseline; other browsers and languages are not promised.
- Local energy-based voice detection is intentionally simple. Speaker echo and noise can cause false triggers; quiet voices may need better microphone positioning.
- The provider is a preview service. Occasional internal service disconnections were observed during development; the app surfaces an error and supports a fresh session, without automatically replaying a question.
- Silent navigation is enforced after a validated switch-only tool request. The model is responsible for interpreting natural language into that intent.
- The ten-minute limit and one-session restriction suit a local demo, not a production service.
- The UI is responsive, but the audio demo was evaluated on desktop Chrome. Accessibility basics are present; this is not a formal accessibility audit.
- No bundled recording claims exist. Use the demo script to record the actual device interaction if a video is desired.
