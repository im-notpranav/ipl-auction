import { sounds } from '../../utils/audio';

// Clock and celebration cues used by the live screens.
export const liveSounds = {
  tick: (secondsLeft: number) => sounds.playTick(secondsLeft),
  going: (stage: 1 | 2) => sounds.playGoing(stage),
  youBought: () => sounds.playYouBought(),
};
