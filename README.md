# Bandwidth WebRTC Browser SDK Documentation

## Initialize the Bandwidth WebRTC Browser SDK

```javascript
import BandwidthRtc from "@bandwidth/webrtc-browser";

const bandwidthRtc = new BandwidthRtc();
```

## API Methods

### connect

- Params:
  - authParams: the device token to connect with
  - options: optional SDK settings (can be omitted)
    - websocketUrl: override the default Bandwidth RTC connection url (this should not generally be needed)
- Description: connect device to the Bandwidth RTC platform

```javascript
await bandwidthRtc.connect({
  deviceToken: deviceToken,
});
```

### publish

- Params:
  - input: the input to publish; this can be an instance of:
    - constraints: the media stream constraints such as audio, peerIdentity, video
      - Type: MediaStreamConstraints
    - mediaStream: An already existing media stream such as a screen share
      - Type: MediaStream
- Return:
  - rtcStream: a media stream with the supplied media stream constraints
    - Type: RtcStream
- Description: publish media

#### Publish with default settings:

```javascript
let rtcStream: RtcStream = await bandwidthRtc.publish();
```

#### Publish audio only

```javascript
const mediaConstraints: MediaStreamConstraints = {
  audio: true,
  video: false,
};
let rtcStream: RtcStream = await bandwidthRtc.publish(mediaConstraints);
```

#### Publish with customized constraints

```javascript
const mediaConstraints: MediaStreamConstraints = {
  audio: {
    autoGainControl: true,
    channelCount: 1,
    deviceId: "default",
    echoCancellation: true,
    latency: 0.01,
    noiseSuppression: true,
    sampleRate: 48000,
    sampleSize: 16,
  },
  video: {
    aspectRatio: 1.3333333333333333,
    frameRate: 30,
    width: { min: 640, ideal: 1280 },
    height: { min: 480, ideal: 720 },
    resizeMode: "none",
  },
};
let rtcStream: RtcStream = await bandwidthRtc.publish(mediaConstraints);
```

#### Publish with existing media stream

```javascript
let screenShare = await navigator.mediaDevices.getDisplayMedia({
  video: true,
});
let rtcStream: RtcStream = await bandwidthRtc.publish(screenShare);
```

Please see the following resources for more information on MediaStreamConstraints and MediaTrackConstraints that can be specified here:

- https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamConstraints
- https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints

### disconnect

- Description: disconnect device from the Bandwidth RTC platform

### DTMF

- Description: send a set of VoIP-network-friendly DTMFs tones. The tone amplitude and duration can not be controlled.
- Params:
  - tone: the digits to send, as a string, chosen from the set of valid DTMF characters [0-9,*,#,\,]
  - streamId (optional): the stream to 'play' the tone on

```javascript
bandwidthRtc.sendDtmf("3");
bandwidthRtc.sendDtmf("313,3211*#");
```

## Event Listeners

### onStreamAvailable

- Description: a media stream is available to attach to the UI

```javascript
bandwidthRtc.onStreamAvailable((event) => {
  console.log(
    `A stream is available with endpointId=${event.endpointId}, its media types are ${event.mediaTypes} and the stream itself is ${event.mediaStream}`
  );
});
```

### onStreamUnavailable

- Description: a media stream is now unavailable and should be removed from the UI

```javascript
bandwidthRtc.onStreamUnavailable((event) => {
  console.log(
    `The stream with endpointId=${event.endpointId} is now unavailable and should be removed from the UI because the media is likely to freeze imminently.`
  );
});
```
