export const validSlide = value => Number.isInteger(value) && value >= 1 && value <= 6;
export function createState(slide = 1) {
  if (!validSlide(slide)) throw new Error('Invalid slide');
  return { slide, resume: slide, mode: 'presentation', epoch: 0 };
}
export function interrupt(state) {
  if (state.mode === 'presentation') state.resume = state.slide;
  state.mode = 'question';
  state.epoch++;
}
export function navigate(state, slide, mode = 'paused') {
  if (!validSlide(slide)) return false;
  if (mode === 'question' && state.mode === 'presentation') state.resume = state.slide;
  state.slide = slide;
  state.mode = mode;
  if (mode !== 'question') state.resume = slide;
  return true;
}
export function control(state, action) {
  if (action === 'pause') {state.mode='paused';return true;}
  if (action === 'resume') return navigate(state, state.resume, 'presentation');
  if (action === 'explain') return navigate(state, state.slide, 'explanation');
  if (action === 'next') return navigate(state, Math.min(6, state.slide + 1));
  if (action === 'previous') return navigate(state, Math.max(1, state.slide - 1));
  return false;
}
export function drain(state, epoch) {
  if (epoch !== state.epoch || state.mode !== 'presentation') return false;
  if (state.slide === 6) { state.mode = 'question'; return false; }
  navigate(state, state.slide + 1, 'presentation');
  return true;
}
