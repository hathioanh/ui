import { next } from '@ember/runloop';
import { set, setProperties, get, observer } from '@ember/object';
import { inject as service } from '@ember/service';
import Component from '@ember/component';
import Util from 'ui/utils/util';
import { alternateLabel } from 'ui/utils/platform';
import layout from './template';
import C from 'ui/utils/constants';

const LINES = 500;

var AnsiUp = null;

export default Component.extend({
  scope: service(),
  prefs: service(),

  layout,
  instance:       null,
  alternateLabel,
  showProtip:     true,
  classNames:    'container-log',

  status:        'connecting',
  containerName: null,
  socket:        null,
  wrapLines:     null,
  isFollow:      true,
  followTimer:   null,

  init() {
    this._super(...arguments);

    if (AnsiUp) {
      this._bootstrap();
    } else {
      import('ansi_up').then( (module) => {
        AnsiUp = module.default;

        this._bootstrap();
      });
    }
  },

  didInsertElement() {
    this._super();
    next(this, () => {
      const body = this.$('.log-body');
      let lastScrollTop = 0;

      body.scroll(() => {
        const scrollTop = body[0].scrollTop;

        if ( lastScrollTop >  scrollTop ) {
          set(this, 'isFollow', false);
        }
        lastScrollTop = scrollTop;
      });

      this.exec();
      var btn = $('.scroll-bottom')[0]; // eslint-disable-line

      if ( btn ) {
        btn.focus();
      }
    });
  },

  willDestroyElement() {
    clearInterval(get(this, 'followTimer'));
    this.disconnect();
    this._super();
  },

  actions: {
    cancel() {
      this.disconnect();
      this.sendAction('dismiss');
    },

    clear() {
      var body = this.$('.log-body')[0];

      body.innerHTML = '';
      body.scrollTop = 0;
    },

    scrollToTop() {
      this.$('.log-body').animate({ scrollTop: '0px' });
    },

    followLog() {
      set(this, 'isFollow', true);
      this.send('scrollToBottom');
    },

    scrollToBottom() {
      var body = this.$('.log-body');

      body.stop().animate({ scrollTop: `${ body[0].scrollHeight + 1000  }px` });
    },
  },

  containerDidChange: observer('containerName', function() {
    this.disconnect();
    this.send('clear');
    this.exec();
  }),

  wrapLinesDidChange: observer('wrapLines', function() {
    set(this, `prefs.${ C.PREFS.WRAP_LINES }`, get(this, 'wrapLines'));
  }),

  _bootstrap() {
    setProperties(this, {
      wrapLines:     !!get(this, `prefs.${ C.PREFS.WRAP_LINES }`),
      containerName: get(this, 'containerName') || get(this, 'instance.containers.firstObject.name'),
    })

    this._initTimer();
  },

  _initTimer() {
    const followTimer = setInterval(() => {
      if ( get(this, 'isFollow') ) {
        this.send('scrollToBottom');
      }
    }, 1000);

    set(this, 'followTimer', followTimer);
  },

  exec() {
    var instance = get(this, 'instance');
    const clusterId = get(this, 'scope.currentCluster.id');
    const namespaceId = get(instance, 'namespaceId');
    const podName = get(instance, 'name');
    const containerName = get(this, 'containerName');
    const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    let url = `${ scheme }${ window.location.host }/k8s/clusters/${ clusterId }/api/v1/namespaces/${ namespaceId }/pods/${ podName }/log`;

    url += `?container=${ encodeURIComponent(containerName) }&tailLines=${ LINES }&follow=true&timestamps=true`;

    this.connect(url);
  },

  connect(url) {
    var socket = new WebSocket(url, 'base64.binary.k8s.io');

    set(this, 'socket', socket);

    var body = this.$('.log-body')[0];
    var $body = $(body); // eslint-disable-line

    set(this, 'status', 'initializing');

    socket.onopen = () => {
      set(this, 'status', 'connected');
    };

    socket.onmessage = (message) => {
      let ansiup = new AnsiUp;

      set(this, 'status', 'connected');
      const data = AWS.util.base64.decode(message.data).toString();
      let html = '';

      data.trim().split(/\n/)
        .filter((line) => line)
        .forEach((line) => {
          var match = line.match(/^\[?([^ \]]+)\]?\s?/);
          var dateStr = '';
          var msg = '';

          if (match && this.isDate(new Date(match[1]))) {
            var date = new Date(match[1]);

            msg = line.substr(match[0].length);
            dateStr = `<span class="log-date">${  Util.escapeHtml(date.toLocaleDateString())  } ${  Util.escapeHtml(date.toLocaleTimeString())  } </span>`;
          } else {
            msg = line;
          }

          // @@TODO@@ - 10-13-17 - needed to remove the escaping here because it was being double escaped but double verify that its acutally being escaped
          html += `<div class="log-msg log-combined">${
            dateStr
          }${ ansiup.ansi_to_html(msg)
          }</div>`
        });

      body.insertAdjacentHTML('beforeend', html);
    };

    socket.onclose = () => {
      if (this.isDestroyed || this.isDestroying) {
        return;
      }

      set(this, 'status', 'disconnected');
    };
  },

  disconnect() {
    set(this, 'status', 'closed');

    var socket = get(this, 'socket');

    if (socket) {
      socket.close();
      set(this, 'socket', null);
    }
  },

  isDate(date) {
    return new Date(date) !== 'Invalid Date' && !isNaN(new Date(date))
  },

});
