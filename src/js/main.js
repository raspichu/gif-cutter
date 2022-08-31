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
