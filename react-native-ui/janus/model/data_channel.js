import Janus from '../janus';
function randomString(len, charSet) {
  charSet =
    charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var randomString = '';
  for (var i = 0; i < len; i++) {
    var randomPoz = Math.floor(Math.random() * charSet.length);
    randomString += charSet.substring(randomPoz, randomPoz + 1);
  }
  return randomString;
}

class DataRoom {
  constructor(room) {
    this.room = room;
  }

  send(text) {
    var message = {
      textroom: 'message',
      transaction: randomString(12),
      room: this.room.room_id,
      text: text,
      ack: false,
    };
    // Note: messages are always acknowledged by default. This means that you'll
    // always receive a confirmation back that the message has been received by the
    // server and forwarded to the recipients. If you do not want this to happen,
    // just add an ack:false property to the message above, and server won't send
    // you a response (meaning you just have to hope it succeeded).
    return new Promise((resolve, reject) => {
      this.plugin.data({
        text: JSON.stringify(message),
        error: reject,
        success: resolve,
      });
    });
  }
  announce(data) {
    var message = {
      textroom: 'announcement',
      transaction: randomString(12),
      room: this.room.room_id,
      text: JSON.stringify(data),
      ack: false,
    };

    return new Promise((resolve, reject) => {
      this.plugin.data({
        text: JSON.stringify(message),
        error: reject,
        success: resolve,
      });
    });
  }

  setup() {
    return new Promise((resolve, reject) => {
      this.room.janus.attach({
        plugin: 'janus.plugin.textroom',
        opaqueId: '' + this.room.user.id,
        success: pluginHandle => {
          this.plugin = pluginHandle;
          var body = {request: 'setup'};
          this.plugin.send({message: body});
        },
        error: function(error) {
          reject();
          console.error('  -- Error attaching plugin...', error);
        },
        webrtcState: function(on) {
          Janus.log(
            'Janus says our WebRTC PeerConnection is ' +
              (on ? 'up' : 'down') +
              ' now',
          );
        },
        onmessage: (msg, jsep) => {
          Janus.debug(' ::: Got a message :::');
          Janus.debug(msg);
          if (msg['error'] !== undefined && msg['error'] !== null) {
            //todo error
          }
          if (jsep !== undefined && jsep !== null) {
            // Answer
            this.plugin.createAnswer({
              jsep: jsep,
              media: {audio: false, video: false, data: true}, // We only use datachannels
              success: jsep => {
                Janus.debug('Got SDP!');
                Janus.debug(jsep);
                var request = {request: 'ack'};
                this.plugin.send({message: request, jsep: jsep});
              },
              error: function(error) {
                Janus.error('WebRTC error:', error);
              },
            });
          }
        },
        ondataopen: data => {
          Janus.debug('The DataChannel is available!');
          const request = {
            request: 'create',
            room: this.room.room_id,
          };
          this.plugin.send({
            message: request,
            success: data => {
              Janus.debug('Textroom created', data);
              if (data.error_code === 418) {
                //then its ok
              }
              this.room.emit('data_channel_created');

              const join_request = {
                textroom: 'join',
                transaction: randomString(12),
                room: this.room.room_id,
                username: this.room.user.name,
                display: this.room.user.name,
              };
              this.plugin.data({
                text: JSON.stringify(join_request),
                success: data => {
                  Janus.debug('Textroom Publisher joined', this.room.room_id);
                  resolve();
                  this.room.emit('data_channel_ready', data);
                },
              });
            },
          });
        },
        ondata: data => {
          Janus.debug('We got data from the DataChannel! ');

          const json = JSON.parse(data);
          // const event = json["textroom"];

          if (json.textroom === 'message') {
            const msg = {
              from: json['from'],
              date: json['date'],
              text: json['text'],
            };
            this.room.emit('data_channel_recv_msg', msg);
          }
          // } else if (event === "announcement") {
          // } else if (event === "join") {
          // } else if (event === "leave") {
          // } else if (event === "kicked") {
          // } else if (event === "destroyed") {
          // }
          this.room.emit('data_channel_recv', json);
        },
        oncleanup: function() {
          Janus.log(' ::: Got a cleanup notification :::');
        },
      });
    });
  }
}
export default DataRoom;
