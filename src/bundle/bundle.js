(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deinterlace = void 0;

/**
 * Deinterlace function from https://github.com/shachaf/jsgif
 */
var deinterlace = function deinterlace(pixels, width) {
  var newPixels = new Array(pixels.length);
  var rows = pixels.length / width;

  var cpRow = function cpRow(toRow, fromRow) {
    var fromPixels = pixels.slice(fromRow * width, (fromRow + 1) * width);
    newPixels.splice.apply(newPixels, [toRow * width, width].concat(fromPixels));
  }; // See appendix E.


  var offsets = [0, 4, 2, 1];
  var steps = [8, 8, 4, 2];
  var fromRow = 0;

  for (var pass = 0; pass < 4; pass++) {
    for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
      cpRow(toRow, fromRow);
      fromRow++;
    }
  }

  return newPixels;
};

exports.deinterlace = deinterlace;
},{}],2:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.decompressFrames = exports.decompressFrame = exports.parseGIF = void 0;

var _gif = _interopRequireDefault(require("js-binary-schema-parser/lib/schemas/gif"));

var _jsBinarySchemaParser = require("js-binary-schema-parser");

var _uint = require("js-binary-schema-parser/lib/parsers/uint8");

var _deinterlace = require("./deinterlace");

var _lzw = require("./lzw");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var parseGIF = function parseGIF(arrayBuffer) {
  var byteData = new Uint8Array(arrayBuffer);
  return (0, _jsBinarySchemaParser.parse)((0, _uint.buildStream)(byteData), _gif["default"]);
};

exports.parseGIF = parseGIF;

var generatePatch = function generatePatch(image) {
  var totalPixels = image.pixels.length;
  var patchData = new Uint8ClampedArray(totalPixels * 4);

  for (var i = 0; i < totalPixels; i++) {
    var pos = i * 4;
    var colorIndex = image.pixels[i];
    var color = image.colorTable[colorIndex] || [0, 0, 0];
    patchData[pos] = color[0];
    patchData[pos + 1] = color[1];
    patchData[pos + 2] = color[2];
    patchData[pos + 3] = colorIndex !== image.transparentIndex ? 255 : 0;
  }

  return patchData;
};

var decompressFrame = function decompressFrame(frame, gct, buildImagePatch) {
  if (!frame.image) {
    console.warn('gif frame does not have associated image.');
    return;
  }

  var image = frame.image; // get the number of pixels

  var totalPixels = image.descriptor.width * image.descriptor.height; // do lzw decompression

  var pixels = (0, _lzw.lzw)(image.data.minCodeSize, image.data.blocks, totalPixels); // deal with interlacing if necessary

  if (image.descriptor.lct.interlaced) {
    pixels = (0, _deinterlace.deinterlace)(pixels, image.descriptor.width);
  }

  var resultImage = {
    pixels: pixels,
    dims: {
      top: frame.image.descriptor.top,
      left: frame.image.descriptor.left,
      width: frame.image.descriptor.width,
      height: frame.image.descriptor.height
    }
  }; // color table

  if (image.descriptor.lct && image.descriptor.lct.exists) {
    resultImage.colorTable = image.lct;
  } else {
    resultImage.colorTable = gct;
  } // add per frame relevant gce information


  if (frame.gce) {
    resultImage.delay = (frame.gce.delay || 10) * 10; // convert to ms

    resultImage.disposalType = frame.gce.extras.disposal; // transparency

    if (frame.gce.extras.transparentColorGiven) {
      resultImage.transparentIndex = frame.gce.transparentColorIndex;
    }
  } // create canvas usable imagedata if desired


  if (buildImagePatch) {
    resultImage.patch = generatePatch(resultImage);
  }

  return resultImage;
};

exports.decompressFrame = decompressFrame;

var decompressFrames = function decompressFrames(parsedGif, buildImagePatches) {
  return parsedGif.frames.filter(function (f) {
    return f.image;
  }).map(function (f) {
    return decompressFrame(f, parsedGif.gct, buildImagePatches);
  });
};

exports.decompressFrames = decompressFrames;
},{"./deinterlace":1,"./lzw":3,"js-binary-schema-parser":4,"js-binary-schema-parser/lib/parsers/uint8":5,"js-binary-schema-parser/lib/schemas/gif":6}],3:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.lzw = void 0;

/**
 * javascript port of java LZW decompression
 * Original java author url: https://gist.github.com/devunwired/4479231
 */
var lzw = function lzw(minCodeSize, data, pixelCount) {
  var MAX_STACK_SIZE = 4096;
  var nullCode = -1;
  var npix = pixelCount;
  var available, clear, code_mask, code_size, end_of_information, in_code, old_code, bits, code, i, datum, data_size, first, top, bi, pi;
  var dstPixels = new Array(pixelCount);
  var prefix = new Array(MAX_STACK_SIZE);
  var suffix = new Array(MAX_STACK_SIZE);
  var pixelStack = new Array(MAX_STACK_SIZE + 1); // Initialize GIF data stream decoder.

  data_size = minCodeSize;
  clear = 1 << data_size;
  end_of_information = clear + 1;
  available = clear + 2;
  old_code = nullCode;
  code_size = data_size + 1;
  code_mask = (1 << code_size) - 1;

  for (code = 0; code < clear; code++) {
    prefix[code] = 0;
    suffix[code] = code;
  } // Decode GIF pixel stream.


  var datum, bits, count, first, top, pi, bi;
  datum = bits = count = first = top = pi = bi = 0;

  for (i = 0; i < npix;) {
    if (top === 0) {
      if (bits < code_size) {
        // get the next byte
        datum += data[bi] << bits;
        bits += 8;
        bi++;
        continue;
      } // Get the next code.


      code = datum & code_mask;
      datum >>= code_size;
      bits -= code_size; // Interpret the code

      if (code > available || code == end_of_information) {
        break;
      }

      if (code == clear) {
        // Reset decoder.
        code_size = data_size + 1;
        code_mask = (1 << code_size) - 1;
        available = clear + 2;
        old_code = nullCode;
        continue;
      }

      if (old_code == nullCode) {
        pixelStack[top++] = suffix[code];
        old_code = code;
        first = code;
        continue;
      }

      in_code = code;

      if (code == available) {
        pixelStack[top++] = first;
        code = old_code;
      }

      while (code > clear) {
        pixelStack[top++] = suffix[code];
        code = prefix[code];
      }

      first = suffix[code] & 0xff;
      pixelStack[top++] = first; // add a new string to the table, but only if space is available
      // if not, just continue with current table until a clear code is found
      // (deferred clear code implementation as per GIF spec)

      if (available < MAX_STACK_SIZE) {
        prefix[available] = old_code;
        suffix[available] = first;
        available++;

        if ((available & code_mask) === 0 && available < MAX_STACK_SIZE) {
          code_size++;
          code_mask += available;
        }
      }

      old_code = in_code;
    } // Pop a pixel off the pixel stack.


    top--;
    dstPixels[pi++] = pixelStack[top];
    i++;
  }

  for (i = pi; i < npix; i++) {
    dstPixels[i] = 0; // clear missing pixels
  }

  return dstPixels;
};

exports.lzw = lzw;
},{}],4:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loop = exports.conditional = exports.parse = void 0;

var parse = function parse(stream, schema) {
  var result = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var parent = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : result;

  if (Array.isArray(schema)) {
    schema.forEach(function (partSchema) {
      return parse(stream, partSchema, result, parent);
    });
  } else if (typeof schema === 'function') {
    schema(stream, result, parent, parse);
  } else {
    var key = Object.keys(schema)[0];

    if (Array.isArray(schema[key])) {
      parent[key] = {};
      parse(stream, schema[key], result, parent[key]);
    } else {
      parent[key] = schema[key](stream, result, parent, parse);
    }
  }

  return result;
};

exports.parse = parse;

var conditional = function conditional(schema, conditionFunc) {
  return function (stream, result, parent, parse) {
    if (conditionFunc(stream, result, parent)) {
      parse(stream, schema, result, parent);
    }
  };
};

exports.conditional = conditional;

var loop = function loop(schema, continueFunc) {
  return function (stream, result, parent, parse) {
    var arr = [];
    var lastStreamPos = stream.pos;

    while (continueFunc(stream, result, parent)) {
      var newParent = {};
      parse(stream, schema, result, newParent); // cases when whole file is parsed but no termination is there and stream position is not getting updated as well
      // it falls into infinite recursion, null check to avoid the same

      if (stream.pos === lastStreamPos) {
        break;
      }

      lastStreamPos = stream.pos;
      arr.push(newParent);
    }

    return arr;
  };
};

exports.loop = loop;
},{}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.readBits = exports.readArray = exports.readUnsigned = exports.readString = exports.peekBytes = exports.readBytes = exports.peekByte = exports.readByte = exports.buildStream = void 0;

// Default stream and parsers for Uint8TypedArray data type
var buildStream = function buildStream(uint8Data) {
  return {
    data: uint8Data,
    pos: 0
  };
};

exports.buildStream = buildStream;

var readByte = function readByte() {
  return function (stream) {
    return stream.data[stream.pos++];
  };
};

exports.readByte = readByte;

var peekByte = function peekByte() {
  var offset = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
  return function (stream) {
    return stream.data[stream.pos + offset];
  };
};

exports.peekByte = peekByte;

var readBytes = function readBytes(length) {
  return function (stream) {
    return stream.data.subarray(stream.pos, stream.pos += length);
  };
};

exports.readBytes = readBytes;

var peekBytes = function peekBytes(length) {
  return function (stream) {
    return stream.data.subarray(stream.pos, stream.pos + length);
  };
};

exports.peekBytes = peekBytes;

var readString = function readString(length) {
  return function (stream) {
    return Array.from(readBytes(length)(stream)).map(function (value) {
      return String.fromCharCode(value);
    }).join('');
  };
};

exports.readString = readString;

var readUnsigned = function readUnsigned(littleEndian) {
  return function (stream) {
    var bytes = readBytes(2)(stream);
    return littleEndian ? (bytes[1] << 8) + bytes[0] : (bytes[0] << 8) + bytes[1];
  };
};

exports.readUnsigned = readUnsigned;

var readArray = function readArray(byteSize, totalOrFunc) {
  return function (stream, result, parent) {
    var total = typeof totalOrFunc === 'function' ? totalOrFunc(stream, result, parent) : totalOrFunc;
    var parser = readBytes(byteSize);
    var arr = new Array(total);

    for (var i = 0; i < total; i++) {
      arr[i] = parser(stream);
    }

    return arr;
  };
};

exports.readArray = readArray;

var subBitsTotal = function subBitsTotal(bits, startIndex, length) {
  var result = 0;

  for (var i = 0; i < length; i++) {
    result += bits[startIndex + i] && Math.pow(2, length - i - 1);
  }

  return result;
};

var readBits = function readBits(schema) {
  return function (stream) {
    var _byte = readByte()(stream); // convert the byte to bit array


    var bits = new Array(8);

    for (var i = 0; i < 8; i++) {
      bits[7 - i] = !!(_byte & 1 << i);
    } // convert the bit array to values based on the schema


    return Object.keys(schema).reduce(function (res, key) {
      var def = schema[key];

      if (def.length) {
        res[key] = subBitsTotal(bits, def.index, def.length);
      } else {
        res[key] = bits[def.index];
      }

      return res;
    }, {});
  };
};

exports.readBits = readBits;
},{}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _ = require("../");

var _uint = require("../parsers/uint8");

// a set of 0x00 terminated subblocks
var subBlocksSchema = {
  blocks: function blocks(stream) {
    var terminator = 0x00;
    var chunks = [];
    var streamSize = stream.data.length;
    var total = 0;

    for (var size = (0, _uint.readByte)()(stream); size !== terminator; size = (0, _uint.readByte)()(stream)) {
      // size becomes undefined for some case when file is corrupted and  terminator is not proper 
      // null check to avoid recursion
      if (!size) break; // catch corrupted files with no terminator

      if (stream.pos + size >= streamSize) {
        var availableSize = streamSize - stream.pos;
        chunks.push((0, _uint.readBytes)(availableSize)(stream));
        total += availableSize;
        break;
      }

      chunks.push((0, _uint.readBytes)(size)(stream));
      total += size;
    }

    var result = new Uint8Array(total);
    var offset = 0;

    for (var i = 0; i < chunks.length; i++) {
      result.set(chunks[i], offset);
      offset += chunks[i].length;
    }

    return result;
  }
}; // global control extension

var gceSchema = (0, _.conditional)({
  gce: [{
    codes: (0, _uint.readBytes)(2)
  }, {
    byteSize: (0, _uint.readByte)()
  }, {
    extras: (0, _uint.readBits)({
      future: {
        index: 0,
        length: 3
      },
      disposal: {
        index: 3,
        length: 3
      },
      userInput: {
        index: 6
      },
      transparentColorGiven: {
        index: 7
      }
    })
  }, {
    delay: (0, _uint.readUnsigned)(true)
  }, {
    transparentColorIndex: (0, _uint.readByte)()
  }, {
    terminator: (0, _uint.readByte)()
  }]
}, function (stream) {
  var codes = (0, _uint.peekBytes)(2)(stream);
  return codes[0] === 0x21 && codes[1] === 0xf9;
}); // image pipeline block

var imageSchema = (0, _.conditional)({
  image: [{
    code: (0, _uint.readByte)()
  }, {
    descriptor: [{
      left: (0, _uint.readUnsigned)(true)
    }, {
      top: (0, _uint.readUnsigned)(true)
    }, {
      width: (0, _uint.readUnsigned)(true)
    }, {
      height: (0, _uint.readUnsigned)(true)
    }, {
      lct: (0, _uint.readBits)({
        exists: {
          index: 0
        },
        interlaced: {
          index: 1
        },
        sort: {
          index: 2
        },
        future: {
          index: 3,
          length: 2
        },
        size: {
          index: 5,
          length: 3
        }
      })
    }]
  }, (0, _.conditional)({
    lct: (0, _uint.readArray)(3, function (stream, result, parent) {
      return Math.pow(2, parent.descriptor.lct.size + 1);
    })
  }, function (stream, result, parent) {
    return parent.descriptor.lct.exists;
  }), {
    data: [{
      minCodeSize: (0, _uint.readByte)()
    }, subBlocksSchema]
  }]
}, function (stream) {
  return (0, _uint.peekByte)()(stream) === 0x2c;
}); // plain text block

var textSchema = (0, _.conditional)({
  text: [{
    codes: (0, _uint.readBytes)(2)
  }, {
    blockSize: (0, _uint.readByte)()
  }, {
    preData: function preData(stream, result, parent) {
      return (0, _uint.readBytes)(parent.text.blockSize)(stream);
    }
  }, subBlocksSchema]
}, function (stream) {
  var codes = (0, _uint.peekBytes)(2)(stream);
  return codes[0] === 0x21 && codes[1] === 0x01;
}); // application block

var applicationSchema = (0, _.conditional)({
  application: [{
    codes: (0, _uint.readBytes)(2)
  }, {
    blockSize: (0, _uint.readByte)()
  }, {
    id: function id(stream, result, parent) {
      return (0, _uint.readString)(parent.blockSize)(stream);
    }
  }, subBlocksSchema]
}, function (stream) {
  var codes = (0, _uint.peekBytes)(2)(stream);
  return codes[0] === 0x21 && codes[1] === 0xff;
}); // comment block

var commentSchema = (0, _.conditional)({
  comment: [{
    codes: (0, _uint.readBytes)(2)
  }, subBlocksSchema]
}, function (stream) {
  var codes = (0, _uint.peekBytes)(2)(stream);
  return codes[0] === 0x21 && codes[1] === 0xfe;
});
var schema = [{
  header: [{
    signature: (0, _uint.readString)(3)
  }, {
    version: (0, _uint.readString)(3)
  }]
}, {
  lsd: [{
    width: (0, _uint.readUnsigned)(true)
  }, {
    height: (0, _uint.readUnsigned)(true)
  }, {
    gct: (0, _uint.readBits)({
      exists: {
        index: 0
      },
      resolution: {
        index: 1,
        length: 3
      },
      sort: {
        index: 4
      },
      size: {
        index: 5,
        length: 3
      }
    })
  }, {
    backgroundColorIndex: (0, _uint.readByte)()
  }, {
    pixelAspectRatio: (0, _uint.readByte)()
  }]
}, (0, _.conditional)({
  gct: (0, _uint.readArray)(3, function (stream, result) {
    return Math.pow(2, result.lsd.gct.size + 1);
  })
}, function (stream, result) {
  return result.lsd.gct.exists;
}), // content frames
{
  frames: (0, _.loop)([gceSchema, applicationSchema, commentSchema, imageSchema, textSchema], function (stream) {
    var nextCode = (0, _uint.peekByte)()(stream); // rather than check for a terminator, we should check for the existence
    // of an ext or image block to avoid infinite loops
    //var terminator = 0x3B;
    //return nextCode !== terminator;

    return nextCode === 0x21 || nextCode === 0x2c;
  })
}];
var _default = schema;
exports["default"] = _default;
},{"../":4,"../parsers/uint8":5}],7:[function(require,module,exports){
"use strict";
/* globals $ */
const { decompressFrame, decompressFrames, parseGIF } = require('gifuct-js');


// Wait for DOM to load jquery
$(document).ready(function () {
    console.log("########################");
    console.log("##  Gif cutter ready  ##");
    console.log("########################");

    // Default gif
    let url = document.getElementById('url');
    url.value = 'https://c.tenor.com/-MusOTDq02AAAAAC/anime-crab.gif';

    // Current frame on main canvas
    let frameIndex = 0;

    // Frames start and end
    let frameBetween = {
        start: null,
        end: null
    };

    // Main canvas
    let c = document.getElementById('c');
    let ctx = c.getContext('2d');

    // Frame start canvas
    let cS = document.getElementById('cS');
    let ctxS = cS.getContext('2d');

    // Frame end canvas
    let cE = document.getElementById('cE');
    let ctxE = cE.getContext('2d');

    // Gif patch canvas for main
    let tempCanvas = document.createElement('canvas');
    let tempCtx = tempCanvas.getContext('2d');

    // Full gif canvas for main
    let gifCanvas = document.createElement('canvas');
    let gifCtx = gifCanvas.getContext('2d');


    // Gif patch canvas for start/end
    let tempCanvasTest = document.createElement('canvas');
    let tempCtxTest = tempCanvasTest.getContext('2d');

    // Full gif canvas for start/end
    let gifCanvasTest = document.createElement('canvas');
    let gifCtxTest = gifCanvasTest.getContext('2d');


    // Frames saved
    let loadedFrames = null;
    let playing = false;


    // Mp4 recording
    let mediaRecorder = null;
    let recording = false;
    let recordedChunks = [];

    // Load file
    $('#file').on('change', (data) => {
        // Get info of the file
        let file = data.target.files[0];
        // Get file buffer
        let reader = new FileReader();
        reader.onload = function () {
            onLoadGif(this.result);
        };
        reader.readAsArrayBuffer(file);
    });

    // Generate button
    $('#export').click(() => {
        saveGif();
    });

    // Load url button
    $('#url-button').click(() => {
        url.value = $('#url').val();
        let oReq = new XMLHttpRequest();
        oReq.open('GET', url.value, true);
        oReq.responseType = 'arraybuffer';
        oReq.onload = function (oEvent) {
            onLoadGif(oReq.response);
        };
        oReq.send(null);
    });
    $('#url-button').click();

    // Sliders start
    $('#frameStartValue').on('input', (data) => {
        let frameStartValue = data.target.value;
        setFrameStart(frameStartValue);
    });
    // Sliders end
    $('#frameEndValue').on('input', (data) => {
        let frameEndValue = data.target.value;
        setFrameEnd(frameEndValue);
    });

    // Slider main
    $('#frameCurrentValue').on('input', (data) => {
        // Stop the canvas and set the frame
        playing = false;
        let frameCurrentValue = data.target.value;
        setFrameCurent(frameCurrentValue);
    });

    // Slider main, 'change' only happens when you release the mouse
    $('#frameCurrentValue').on('change', (data) => {
        // Play animation again
        playing = true;
    });

    function onLoadGif(arrayBuffer) {
        // Note: not oReq.responseText
        if (arrayBuffer) {
            let gParsed = parseGIF(arrayBuffer);
            let gDecompress = decompressFrames(gParsed, true);
            renderGIF(gDecompress);
        } else {
            console.error("Can't load a gif from that");
        }
    }

    function renderGIF(frames) {
        loadedFrames = frames;

        // Reset frame
        frameIndex = 0;

        // Set sizes
        c.width = frames[0].dims.width;
        c.height = frames[0].dims.height;

        cS.width = c.width;
        cS.height = c.height;

        cE.width = c.width;
        cE.height = c.height;

        gifCanvas.width = c.width;
        gifCanvas.height = c.height;

        gifCanvasTest.width = c.width;
        gifCanvasTest.height = c.height;


        // Set default frames
        setDefaultFrames(frames.length - 1);

        // Start playing
        if (!playing) {
            playing = true;
            doContinuousRender();
        }

    }

    // Function to keep drawing the gif
    function doContinuousRender() {
        // delay the next gif frame
        let frame = loadedFrames[frameIndex];
        setTimeout(function () {
            if (playing) {
                requestAnimationFrame(() => { setFrameCurent(frameIndex); });
                frameIndex++;
                if (frameIndex >= loadedFrames.length || frameIndex > frameBetween.end) {
                    frameIndex = 0;
                    // Mp4 stuff
                    if (recording) {
                        if (mediaRecorder) mediaRecorder.stop();
                        recording = false;
                    }
                }

                if (frameIndex < frameBetween.start) frameIndex = frameBetween.start;
            }
            doContinuousRender();
        }, Math.max(0, Math.floor(frame.delay)));
    }

    // Set the frame of the main canvas
    function setFrameCurent(value) {
        $('#frameCurrentValue').val(value);
        $('#frameNumber').text(value + '/' + (loadedFrames.length - 1));
        frameIndex = value;
        renderFrame(frameIndex, 'current');
    }

    // Set the frame of the frame start canvas
    function setFrameStart(value) {
        $('#frameStartValue').val(value);
        $('#frameStart').text(value);
        frameBetween.start = value;
        renderFrame(value, 'start');
    }

    // Set the frame of the frame end canvas
    function setFrameEnd(value) {
        $('#frameEndValue').val(value);
        $('#frameEnd').text(value);
        frameBetween.end = value;
        renderFrame(value, 'end');
    }

    // Set the value, max and min values of the sliders and draw the default frames
    function setDefaultFrames(max) {
        // Set the max and min for the sliders
        $('#frameStartValue').attr('min', 0);
        $('#frameStartValue').attr('max', max);

        $('#frameEndValue').attr('min', 0);
        $('#frameEndValue').attr('max', max);

        $('#frameCurrentValue').attr('min', 0);
        $('#frameCurrentValue').attr('max', max);

        // Set the default frames
        setFrameStart(0);
        setFrameEnd(max);
        setFrameCurent(0);
    }


    // Draws a frame in the canvas
    function renderFrame(index, type) {
        // get the frame
        let temp = type == 'start' || type == 'end';

        let frame = loadedFrames[index];
        if (frame.disposalType === 2) {
            let cUsing = type == 'start' ? cS : type == 'end' ? cE : c;
            (temp ? gifCtxTest : gifCtx).clearRect(0, 0, cUsing.width, cUsing.height);
        }

        // Create the image, for the start and end canvas, it's created on different ctx for not stopping the main
        let dims = frame.dims;
        let imageData;
        if (temp) {
            imageData = tempCtxTest.createImageData(dims.width, dims.height);
            // imageData = gifCtxTest.getImageData(0, 0, gifCanvasTest.width, gifCanvasTest.height);
        } else {
            imageData = tempCtx.createImageData(dims.width, dims.height);
            // imageData = gifCtx.getImageData(0, 0, gifCanvas.width, gifCanvas.height);
        }
        imageData.data.set(frame.patch);

        // Select the correct canvas
        let cUsing = type == 'start' ? cS : type == 'end' ? cE : c;
        let ctxUsing = type == 'start' ? ctxS : type == 'end' ? ctxE : ctx;

        // Do pixelation
        let pixelsX = (cUsing).width;
        let pixelsY = (pixelsX * (cUsing).height) / (cUsing).width;

        // Draw all the image on the canvas
        // Add the data to the canvas
        (ctxUsing).putImageData(imageData, 0, 0);
        // Clear image
        // (ctxUsing).drawImage(cUsing, 0, 0, (cUsing).width, (cUsing).height, 0, 0, pixelsX, pixelsY);
        // Set the image to the canvas
        (ctxUsing).drawImage(cUsing, 0, 0, pixelsX, pixelsY, 0, 0, (cUsing).width, (cUsing).height);
    }


    // Function to export the gif
    function saveGif() {

        console.log("Generating gif");
        return new Promise(function (res, rej) {

            // Disable all the buttons
            $('#export').attr('disabled', true);
            $('#export>.spinner-border').removeClass('d-none');
            $('#url-button').attr('disabled', true);
            $('#url').attr('disabled', true);
            $('#file').attr('disabled', true);

            // Create a new gif
            const gif = new GIF({
                workers: 10,
                quality: 0
            });
            // When it finish (do the render), do the export 
            gif.on('finished', function (blob) {
                $('#result-gif-display').removeClass('d-none');

                let url = URL.createObjectURL(blob);
                
                document.getElementById("result-gif").src = url;


                // Enable all the buttons
                $('#export').attr('disabled', false);
                $('#export>.spinner-border').addClass('d-none');
                $('#url-button').attr('disabled', false);
                $('#url').attr('disabled', false);
                $('#file').attr('disabled', false);
            });

            // Iterate the frames to create the final gif
            for (let i = 0; i < loadedFrames.length; i++) {
                if (i < frameBetween.start || i > frameBetween.end) continue;
                let frame = loadedFrames[i];
                let dims = frame.dims;
                // Create the image data
                let imageData = tempCtxTest.createImageData(dims.width, dims.height);
                imageData.data.set(frame.patch);
                // Add it to the gif
                gif.addFrame(imageData, { delay: frame.delay });
            }
            // Render the gif
            gif.render();

            // MP4
            //     if (mediaRecorder && mediaRecorder.state === 'recording') {
            //         mediaRecorder.stop();
            //     }
            //     recording = true;
            //     frameIndex = frameBetween.start || 0;
            //     let stream = c.captureStream(60);
            //     mediaRecorder = new MediaRecorder(stream, {
            //         mimeType: "video/webm; codecs=vp9"
            //     });

            //     mediaRecorder.start(0);

            //     mediaRecorder.ondataavailable = function (e) {
            //         recordedChunks.push(e.data);
            //     };

            //     mediaRecorder.onstop = function (event) {


            //         console.log('recordedChunks: ', recordedChunks);
            //         let blob = new Blob(recordedChunks, {
            //             "type": "video/webm"
            //         });
            //         let url = URL.createObjectURL(blob);
            //         res({ url, blob }); // resolve both blob and url in an object

            //         document.getElementById("result-video").src = url;
            //         // removed data url conversion for brevity
            //     };
        });
    }
});

},{"gifuct-js":2}]},{},[7]);
