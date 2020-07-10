// Literals
const MaxToneDuration = 6000;
const DefaultToneDuration = 1500;
const MinToneDuration = 40;

class DtmfSender {
  // Audio context
  private outputNode: MediaStreamAudioDestinationNode;
  private outputStream: MediaStream;
  private gain: GainNode;
  private filter: BiquadFilterNode;
  private sourceNode: MediaStreamAudioSourceNode;
  private osc1: OscillatorNode;
  private osc2: OscillatorNode;

  // State
  private toneDuration: number = 1500;
  private tone: string = "";
  private playing: boolean = false;

  private dtmfFreq: Map<string, Array<number>> = new Map([
    ["1", [1209, 697]],
    ["2", [1336, 697]],
    ["3", [1477, 697]],
    ["4", [1209, 770]],
    ["5", [1336, 770]],
    ["6", [1477, 770]],
    ["7", [1209, 852]],
    ["8", [1336, 852]],
    ["9", [1477, 852]],
    ["*", [1209, 941]],
    ["0", [1336, 941]],
    ["#", [1477, 941]]
  ]);

  constructor(sender: RTCRtpSender) {
    if (!sender || !sender.track) {
      throw new Error("Invalid RTCRtpSender");
    }

    let audioCtx = new AudioContext();
    this.outputNode = audioCtx.createMediaStreamDestination();
    this.outputStream = this.outputNode.stream;

    let inputStream: MediaStream = new MediaStream([sender.track]);
    let rtpSender: RTCRtpSender = sender;

    this.sourceNode = audioCtx.createMediaStreamSource(inputStream);
    this.sourceNode.connect(this.outputNode);

    this.osc1 = audioCtx.createOscillator();
    this.osc1.type = "sine";
    this.osc1.frequency.value = 0;
    this.osc1.connect(this.outputNode);
    this.osc1.start(0);

    this.osc2 = audioCtx.createOscillator();
    this.osc2.type = "sine";
    this.osc2.frequency.value = 0;
    this.osc2.connect(this.outputNode);
    this.osc2.start(0);

    this.gain = audioCtx.createGain();
    this.gain.gain.value = 0.25;

    this.filter = audioCtx.createBiquadFilter();
    this.filter.type = "lowpass";

    this.osc1.connect(this.gain);
    this.osc2.connect(this.gain);

    this.gain.connect(this.filter);
    this.filter.connect(audioCtx.destination);

    if (rtpSender) {
      rtpSender.replaceTrack(this.outputStream.getAudioTracks()[0]);
    }

    return this;
  }

  insertDtmf(tone: string, duration = DefaultToneDuration) {
    if ((tone.length !== 1) || (/[^0-9a-d#\*,]/i.test(tone))) {
      throw new Error("Invalid tone");
    }

    this.toneDuration = Math.min(MaxToneDuration, Math.max(MinToneDuration, duration));
    this.tone = tone;

    if (!this.playing) {
      setTimeout(this.playTone.bind(this), 0);
      this.playing = true;
    }
  }

  private playTone() {
    let digit: string = this.tone[0];
    let f = this.dtmfFreq.get(digit.toLowerCase());

    // Stop the tone immediately if frequencies are not found
    let toneDuration: number = 0;
    if (f) {
      this.osc1.frequency.value = f[0];
      this.osc2.frequency.value = f[1];
      toneDuration = this.toneDuration;
    }
    setTimeout(this.stopTone.bind(this), toneDuration);
  }

  private stopTone() {
    this.playing = false;
    this.osc1.frequency.value = 0;
    this.osc2.frequency.value = 0;
  }
}

export default DtmfSender;
