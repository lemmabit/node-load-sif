import { makePulley } from 'xml-pulley';

import * as Version from './version.js';
import * as Guid from './guid.js';

import * as Color from './types/color.js';
import * as Canvas from './types/canvas.js';
import * as Vector from './types/vector.js';
import * as Keyframe from './types/keyframe.js';


function checkAttribute(tag, name) {
  if(tag.attributes[name] === undefined) {
    throw Error(`<${tag.name}> is missing attribute "${name}"!`);
  }
}


export default function loadSif(file) {
  const pulley = makePulley(file, {
    trim: true,
    normalize: true,
    skipWhitespaceOnly: true
  });
  return parseCanvas(pulley);
}


function parseCanvas(pulley, parent, inline) {
  const tag = pulley.checkName('canvas'), attrs = tag.attributes;
  
  if(attrs['guid'] && guid.exists(attrs['guid'])) {
    pulley.skipTag();
    return guid.get(attrs['guid']);
  }
  
  let canvas;
  
  if(inline || !parent) {
    canvas = Canvas.create();
  } else if(parent) {
    canvas = Canvas.childCanvas(canvas, attrs['id']);
  }
  
  if(attrs['guid']) {
    guid.set(attrs['guid'], canvas);
  }
  if(attrs['version']) {
    canvas.version = attrs['version'];
  }
  if(attrs['width']) {
    const width = parseInt(attrs['width']);
    if(width < 1) {
      throw Error("Canvas with width or height less than one is not allowed");
    }
    canvas.width = width;
  }
  if(attrs['height']) {
    const height = parseInt(attrs['height']);
    if(height < 1) {
      throw Error("Canvas with width or height less than one is not allowed");
    }
    canvas.height = height;
  }
  if(attrs['xres']) {
    canvas.xres = parseFloat(attrs['xres']);
  }
  if(attrs['yres']) {
    canvas.yres = parseFloat(attrs['yres']);
  }
  if(attrs['fps']) {
    canvas.fps = parseFloat(attrs['fps']);
  }
  if(attrs['begin-time'] || attrs['start-time']) {
    canvas.timeStart = parseTime(attrs['begin-time'] || attrs['start-time'], canvas.fps);
  }
  if(attrs['end-time']) {
    canvas.timeEnd = parseTime(attrs['end-time'], canvas.fps);
  }
  if(attrs['antialias']) {
    canvas.antialias = parseInt(attrs['antialias']);
  }
  if(attrs['view-box']) {
    const values = attrs['view-box'].split(' ');
    if(values.length !== 4) {
      throw Error(`view-box has 4 parameters; ${values.length} given`);
    }
    canvas.tl = Vector.create(parseFloat(values[0]), parseFloat(values[1]));
    canvas.br = Vector.create(parseFloat(values[2]), parseFloat(values[3]));
  }
  if(attrs['bgcolor']) {
    const values = attrs['bgcolor'].split(' ');
    if(values.length !== 4) {
      throw Error(`bgcolor has 4 parameters; ${values.length} given`);
    }
    canvas.bgcolor = Color.create(parseFloat(values[0]), parseFloat(values[1]),
                                  parseFloat(values[2]), parseFloat(values[3]));
  }
  if(attrs['focus']) {
    const values = attrs['focus'].split(' ');
    if(values.length !== 2) {
      throw Error(`focus has 2 parameters; ${values.length} given`);
    }
    canvas.focus = Vector.create(parseFloat(values[0]), parseFloat(values[1]));
  }
  
  pulley.loopTag((pulley) => {
    const tag = pulley.check('opentag');
    switch(tag.name) {
      case 'defs': {
        if(inline) {
          throw Error("Inline canvases can't have defs!");
        }
        parseCanvasDefs(pulley, canvas);
        break;
      }
      case 'bones': {
        console.warn("Bones are unsupported and probably will be forever.");
        pulley.skipTag();
        break;
      }
      case 'keyframe': {
        if(inline) {
          console.warn("Inline canvases can't have keyframes.");
          pulley.skipTag();
          break;
        }
        Canvas.addKeyframe(canvas, parseKeyframe(pulley, canvas));
        break;
      }
      case 'meta': {
        if(inline) {
          console.warn("Inline canvases can't have metadata.");
          pulley.skipTag();
          break;
        }
        parseMetaInto(pulley, canvas);
        break;
      }
      case 'name': case 'desc': case 'author': {
        pulley.expectName(tag.name);
        canvas[tag.name] = pulley.nextText().text;
        pulley.expectName(tag.name, 'closetag');
        break;
      }
      case 'layer': {
        Canvas.addLayer(canvas, parseLayer(pulley, canvas));
        break;
      }
      default: {
        throw Error(`Unexpected element in <canvas>: <${tag.name}>`);
      }
    }
  }, 'canvas');
  
  return canvas;
}

function parseCanvasDefs(pulley, canvas) {
  throw Error("defs not implemented");
}

function parseKeyframe(pulley, canvas) {
  canvas = canvas || {};
  
  const tag = pulley.expectName('keyframe'), attrs = tag.attributes;
  
  checkAttribute(tag, 'time');
  const time = attrs['time'], active = attrs['active'];
  
  const out = Keyframe.create(parseTime(time, canvas.fps),
                              active !== 'false' && active !== '0',
                              pulley.nextText().text);
  pulley.expectName('keyframe', 'closetag');
  
  return out;
}

function parseMetaInto(pulley, canvas) {
  const tag = pulley.expectName('meta'), attrs = tag.attributes;
  
  checkAttribute(tag, 'name');
  checkAttribute(tag, 'content');
  const name = attrs['name'];
  let content = attrs['content'];
  
  if([
       'background_first_color',
       'background_second_color',
       'background_size',
       'grid_color',
       'grid_size',
       'jack_offset'
     ].indexOf(name) !== -1) {
    content = content.replace(/,/g, '.');
  }
  canvas.metadata[name] = content;
  
  pulley.expectName('meta', 'closetag');
}

function parseLayer(pulley, canvas) {
  throw Error("layer not implemented");
}


function parseTime(stamp, fps) {
  fps = fps || 0;
  stamp = stamp.toLowerCase();
  
  if(stamp === 'sot' || stamp === 'bot')
    return -32767.0*512.0;
  if(stamp === 'eot')
    return 32767.0*512.0;
  
  let value = 0;
  for(let pos = 0, len = stamp.length; pos < len; ++pos) {
    const match = /-?\d*\.?\d*/.exec(stamp.substr(pos));
    let amount = 0;
    if(match) {
      amount = +match[0] || 0;
      pos += match[0].length;
    }
    if(pos >= stamp.length || !match) {
      if(amount !== 0) {
        if(fps) {
          console.warn(`timecode "${stamp}": no unit provided; assuming frames`);
          value += amount / fps;
        } else {
          console.warn(`timecode "${stamp}": no unit provided, no FPS given; assuming seconds`);
          value += amount;
        }
      }
      return value;
    }
    const code = stamp.charAt(pos);
    if(code === 'h') {
      value += amount * 3600;
    } else if(code === 'm') {
      value += amount * 60;
    } else if(code === 's') {
      value += amount;
    } else if(code === 'f') {
      if(fps)
        value += amount / fps;
      else
        console.warn(`timecode "${stamp}": individual frames referenced, but FPS is unknown`);
    } else if(code == ':') {
      const parts = stamp.split(':');
      if(parts.length >= 3) {
        const dot = parts[2].indexOf('.');
        if(dot >= 0) {
          parts.push(parts[2].substr(dot+1));
          parts[2] = parts[2].substr(0,dot);
        }
        value = (+parts[0] || 0)*3600 + (+parts[1] || 0)*60 + (+parts[2] || 0);
        if(parts.length >= 4) {
          if(fps)
            value += (+parts[3] || 0) / fps;
          else
            console.warn(`timecode "${stamp}": individual frames referenced, but FPS is unknown`);
        }
        return value;
      } else {
        console.warn(`timecode "${stamp}": bad time format`);
      }
    } else {
      console.warn(`timecode "${stamp}": unexpected unit code "${code}"; assuming seconds`);
      value += amount;
    }
  }
  return value;
}
