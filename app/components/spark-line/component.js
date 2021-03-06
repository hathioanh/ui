import { htmlSafe } from '@ember/string';
import { inject as service } from '@ember/service';
import Component from '@ember/component';
import { GRADIENT_COLORS } from 'shared/components/svg-gradients/component';
import { formatPercent, formatMib, formatKbps }
  from 'ui/utils/util';
import {
  select,
  scale,
  min as d3Min,
  max as d3Max,
} from 'd3';
import layout from './template';

const FORMATTERS = {
  value:   (value) => value,
  percent: formatPercent,
  mib:     formatMib,
  kbps:    formatKbps
};

export default Component.extend({
  intl:              service(),
  layout,
  tagName:           'svg',
  classNames:        ['spark-line'],
  attributeBindings: ['cssSize:style'],

  data:            null,
  width:           null,
  height:          20,
  margin:          2,

  min:             0,

  minMax:          null,  // lower bound on how small automatic max can be
  max:             null,  // set an explicit max
  maxDoubleInital: false, // if true, set max to double the initial non-zero data point
  scaleDown:       false, // if true, max is allowed to go back down.  If false it can only go up.

  gradient:        null,
  colorIdx:        0,
  interpolation:   'basis', // 'step-after',
  formatter:       'value',

  svg:             null,
  line:            null,
  dot:             null,
  text:            null,
  textBg:          null,
  x:               null,
  y:               null,
  observedMax:     null, // The largest max seen so far

  hasData: function() {
    if (this.get('data.length') > 0 && !this.get('svg')) {
      this.create();
    }
  }.observes('data.length'),

  cssSize: function() {
    let margin = parseInt(this.get('margin', 10));
    let width  = (parseInt(this.get('width'), 10) + 2 * margin);
    let height = (parseInt(this.get('height'), 10) + 2 * margin);

    return new htmlSafe(`width: ${ width }px; height: ${ height }px`);
  }.property('width', 'height'),

  lastValue: function() {
    var data = this.get('data');

    if (data && data.get('length')) {
      return data.objectAt(data.get('length') - 1);
    }
  }.property('data.[]'),

  updateLine: function() {
    var line = this.get('line');
    var interp = this.get('interpolation');

    if (line) {
      line.interpolate(interp);
    }
  }.observes('interpolation'),

  update: function() {
    var svg = this.get('svg');
    var data = (this.get('data') || []).slice();
    var x = this.get('x');
    var y = this.get('y');
    var line = this.get('line');
    var text = this.get('text');
    var textBg = this.get('textBg');
    var width = this.get('width');
    var height = this.get('height');
    var margin = this.get('margin');

    if (svg && data && x && y && line) {
      x.domain([0, data.get('length') - 1]);
      x.range([0, width - margin]);

      var min = this.get('min') === null ? d3Min(data) : this.get('min');
      var max = this.adjustMax(d3Max(data));

      y.domain([min, max]);
      y.range([height - margin, margin]);
      y.rangeRound([height - margin, margin]);

      // console.log('update', data[data.length-2], data[data.length-1], x.domain(), x.range(), y.domain(), y.range());
      svg.selectAll('path')
        .data([data])
        .attr('d', line);

      this.get('dot')
        .attr('cx', x(data.length - 1) || 0 )
        .attr('cy', y(data[data.length - 1]) || 0);

      var str = FORMATTERS[this.get('formatter')](this.get('lastValue'));

      text.text(str);
      textBg.text(str);

      text
        .attr('x', width / 2)
        .attr('y', height)

      textBg
        .attr('x', width / 2)
        .attr('y', height);
    }
  }.observes('data', 'data.[]'),
  create() {
    let margin = this.get('margin');
    var svg = select(this.$()[0])
      .attr('transform', `translate(${  margin  },${  margin  })`);

    this.set('svg', svg);
    this.set('x', scale.linear());
    this.set('y', scale.linear());

    var line = svg.line()
      .defined((d) => (typeof d === 'number'))
      .x((d, i) => this.get('x')(i))
      .y((d) => this.get('y')(d));

    this.set('line', line);

    this.updateLine();

    let path = svg.append('path')
      .attr('class', `spark-path`)
      .attr('d', line(this.get('data')));

    if ( this.get('gradient') ) {
      path.style('stroke', GRADIENT_COLORS[this.get('gradient')][this.get('colorIdx')])
    }

    var dot = svg.append('circle')
      .attr('class', 'spark-dot')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 2);

    this.set('dot', dot);

    var textBg = svg.append('text')
      .attr('class', `spark-text-bg`)
      .attr('alignment-baseline', 'middle')
      .attr('text-anchor', 'middle')
      .attr('x', 0)
      .attr('y', 0);

    this.set('textBg', textBg);

    var text = svg.append('text')
      .attr('class', `spark-text`)
      .attr('class', `spark-text`)
      .attr('alignment-baseline', 'middle')
      .attr('text-anchor', 'middle')
      .attr('x', 0)
      .attr('y', 0);

    this.set('text', text);
  },

  adjustMax(dataMax) {
    let optMinMax = this.get('minMax');
    let optMax = this.get('max');
    let optScaleDown = this.get('scaleDown');
    let observedMax = this.get('observedMax');

    let out = dataMax;

    if ( optMax ) {
      out = optMax;
    } else if ( optMinMax ) {
      out = Math.max(optMinMax, out);
    }

    if ( observedMax && !optScaleDown ) {
      out = Math.max(observedMax, out);
    }

    if ( !observedMax && out > 0 && this.get('maxDoubleInital') ) {
      out *= 2;
    }

    this.set('observedMax', out);

    return out;
  },

});
