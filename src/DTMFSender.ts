class DTMFSender {
  private _outputNode: MediaStreamAudioDestinationNode;
  private _outputStream: MediaStream;
  private _gain: GainNode;
  private _filter: BiquadFilterNode;
  private _sourceNode: MediaStreamAudioSourceNode;
  private _osc1: OscillatorNode;
  private _osc2: OscillatorNode;
  private _toneDuration: number = 1500;
  private _toneGap: number = 70;
  private _tone: string = "";
  private _playing: boolean = false;

  private _dtmfFreq: Map<string, Array<number>> = new Map([
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
    var audioCtx = new AudioContext();
    this._outputNode = audioCtx.createMediaStreamDestination();
    this._outputStream = this._outputNode.stream;

    if (sender.track) {
      var inputStream: any = new MediaStream([sender.track]);
      var rtpSender: any = sender;
    } else {
      var inputStream: any = sender;
      this._outputStream = this._outputStream;
      var rtpSender: any = null;
    }

    this._sourceNode = audioCtx.createMediaStreamSource(inputStream);
    this._sourceNode.connect(this._outputNode);

    this._osc1 = audioCtx.createOscillator();
    this._osc1.connect(this._outputNode);
    this._osc1.type = "sine";
    this._osc1.frequency.value = 0;
    this._osc1.start(0);

    this._osc2 = audioCtx.createOscillator();
    this._osc2.connect(this._outputNode);
    this._osc2.type = "sine";
    this._osc2.frequency.value = 0;
    this._osc2.start(0);

    this._gain = audioCtx.createGain();
    this._gain.gain.value = 0.25;

    this._filter = audioCtx.createBiquadFilter();
    this._filter.type = "lowpass";

    this._osc1.connect(this._gain);
    this._osc2.connect(this._gain);

    this._gain.connect(this._filter);
    this._filter.connect(audioCtx.destination);

    if (rtpSender) {
      rtpSender.replaceTrack(this._outputStream.getAudioTracks()[0]);
    }

    return this;
  }

  insertDTMF(tone: string, duration: number, toneGap: number) {
    if ((tone.length != 1) || (/[^0-9a-d#\*,]/i.test(tone))) {
      throw new Error("Invalid tone");
    }

    this._toneDuration = Math.min(6000, Math.max(40, duration || 100));
    this._toneGap = Math.max(40, toneGap || 70);
    this._tone = tone;

    if (!this._playing) {
      setTimeout(this._playTone.bind(this), 0);
      this._playing = true;
    }
  }

  _playTone() {
    var digit: string = this._tone[0];
    var f = this._dtmfFreq.get(digit.toLowerCase());

    // Stop the tone immediately if frequencies are not found
    var toneDuration: number = 0;
    if (f) {
      this._osc1.frequency.value = f[0];
      this._osc2.frequency.value = f[1];
      toneDuration = this._toneDuration;
    }
    setTimeout(this._stopTone.bind(this), toneDuration);
  }

  _stopTone() {
    this._playing = false;
    this._osc1.frequency.value = 0;
    this._osc2.frequency.value = 0;
  }
}

export default DTMFSender;
