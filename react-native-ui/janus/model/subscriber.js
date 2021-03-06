import Janus from "../janus";
const EventEmitter = require("events");

class VideoSubscribe extends EventEmitter {
  constructor(room) {
    super();
    this.room = room;
  }
  isLive() {
    return (
      this.plugin &&
      this.plugin.webrtcStuff.pc.iceConnectionState !== "completed" &&
      this.plugin.webrtcStuff.pc.iceConnectionState !== "connected"
    );
  }

  connect(id, video_codec = null) {
    return new Promise((resolve, reject) => {
      this.room.janus.attach({
        plugin: "janus.plugin.videoroom",
        opaqueId: "" + this.room.user.id,
        success: (pluginHandle) => {
          this.plugin = pluginHandle;

          const create = {
            request: "create",
            notify_joining: true,
            room: this.room.room_id,
            secret: this.secret,
            pin: this.pin,
          };
          // send message to create new room
          this.plugin.send({
            message: create,
            success: (data) => {
              Janus.log("created room", data);
              // check if room create is okay
              if (
                data.videoroom &&
                (data.videoroom === "created" || data.error_code === 427)
              ) {
                // now register ourselves

                var subscribe = {
                  request: "join",
                  room: this.room.room_id,
                  ptype: "subscriber",
                  feed: id,
                  display: this.room.user.name,
                };

                if (
                  Janus.webRTCAdapter.browserDetails.browser === "safari" &&
                  (video_codec === "vp9" ||
                    (video_codec === "vp8" && !Janus.safariVp8))
                ) {
                  if (video_codec) video_codec = video_codec.toUpperCase();
                  subscribe.offer_video = false;
                }
                this.plugin.videoCodec = video_codec;
                this.plugin.send({ message: subscribe, error: reject });
              }
            },
            error: reject,
          });
        },
        onmessage: (msg, jsep) => {
          Janus.debug("Got a message (subscriber) ", msg);

          if (jsep !== undefined && jsep !== null) {
            Janus.debug("SUBS: Handling SDP as well...");
            Janus.debug(jsep);
            // Answer and attach
            this.plugin.createAnswer({
              jsep: jsep,
              // Add data:true here if you want to subscribe to datachannels as well
              // (obviously only works if the publisher offered them in the first place)
              media: { audioSend: false, videoSend: false }, // We want recvonly audio/video
              success: (jsep) => {
                Janus.debug("Got SDP!");
                Janus.debug(jsep);
                var body = { request: "start", room: this.room.room_id };
                this.plugin.send({
                  message: body,
                  jsep: jsep,
                  success: resolve,
                });
              },
              error: reject,
            });
          }
        },
        webrtcState: (on) => {
          this.emit("webrtcState", on);
        },
        onremotestream: (stream) => {
          this.emit("onremotestream", stream);
        },
        oncleanup: () => {
          this.emit("oncleanup");
        },
      });
    });
  }
}
export default VideoSubscribe;
