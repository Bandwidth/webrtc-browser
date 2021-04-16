import { BandwidthRtc } from "./bandwidthRtc";

test("test constructor", () => {
  const bandwidthRtc = new BandwidthRtc();
  expect(bandwidthRtc).toBeInstanceOf(BandwidthRtc);
  expect(bandwidthRtc.setMicEnabled).toBeInstanceOf(Function);
  expect(bandwidthRtc.setCameraEnabled).toBeInstanceOf(Function);
});

test("test connect", () => {
  const bandwidthRtc = new BandwidthRtc();
  const authParams = {
    deviceToken: "biz",
  };
  const options = {
    websocketUrl: "huh://not.real.url.becaused.its.mocked",
  };

  bandwidthRtc.createSignalingBroker = jest.fn();
  bandwidthRtc.signaling.addListener = jest.fn();
  bandwidthRtc.signaling.connect = jest.fn();
  bandwidthRtc.connect(authParams, options);

  expect(bandwidthRtc.handleIceCandidateEvent).toBeInstanceOf(Function);
  expect(bandwidthRtc.handleSdpNeededEvent).toBeInstanceOf(Function);
  expect(bandwidthRtc.handleEndpointRemovedEvent).toBeInstanceOf(Function);
  expect(bandwidthRtc.signaling.connect).toBeCalledTimes(1);
  expect(bandwidthRtc.signaling.connect).toBeCalledWith(authParams, options);
});

test("test getMediaDevices", async () => {
  const bandwidthRtc = new BandwidthRtc();

  navigator.mediaDevices = jest.mock();
  navigator.mediaDevices.enumerateDevices = jest.fn(() =>
    Promise.resolve([
      {
        deviceId: "default",
        kind: "audioinput",
        label: "Default",
        groupId: "cbbd856b3fa6b1a8e87def7ccf8b715473302cb565823f6a7f311cb46325279c",
      },
      {
        deviceId: "b5aaf23936d9c9cdf6aed368cc8a35f51b081611e2aad97d0379779f43bbe4e6",
        kind: "audioinput",
        label: "OrbiCam Analog Stereo",
        groupId: "65cb96a57369e87ce2d88921df3a95aa87464ad3afd32a6710860f69be919d90",
      },
      {
        deviceId: "b1f3a3c207db50447a7d9526fdbeeca5118d23023eb9cd60ab487dc1e552e944",
        kind: "videoinput",
        label: "HD Pro Webcam C920 (046d:0892)",
        groupId: "a06082a517d049ddb91b14623b5acc04c4445b9aadafead8ead53530dd4d1555",
      },
      {
        deviceId: "default",
        kind: "audiooutput",
        label: "Default",
        groupId: "default",
      },
      {
        deviceId: "dd7c210a57368a97a5133b617ad3a8eba85507c05fc9ca13724364fe4122a0a7",
        kind: "audiooutput",
        label: "Built-in Audio Analog Stereo",
        groupId: "f196720f272a589069985685323a804ba77a981f0259c0a423dd666876472103",
      },
    ])
  );

  let devices = await bandwidthRtc.getMediaDevices();
  expect(devices.length).toBe(5);

  devices = await bandwidthRtc.getMediaDevices("audioinput");
  expect(devices.length).toBe(2);

  devices = await bandwidthRtc.getMediaDevices("foo");
  expect(devices.length).toBe(0);

  let audioInputs = await bandwidthRtc.getAudioInputs();
  expect(audioInputs.length).toBe(2);

  let audioOutputs = await bandwidthRtc.getAudioOutputs();
  expect(audioOutputs.length).toBe(2);

  let videoInputs = await bandwidthRtc.getVideoInputs();
  expect(videoInputs.length).toBe(1);

  expect(navigator.mediaDevices.enumerateDevices).toBeCalledTimes(6);
});
