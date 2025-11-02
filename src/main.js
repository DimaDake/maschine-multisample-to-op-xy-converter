// --- Core Conversion Logic & Helpers (from user prompt) ---

const HEADER_LENGTH = 44;
const MAX_AMPLITUDE = 0x7FFF;

async function resampleAudio(file, targetSampleRate) {
    // Use an offline audio context to prevent sound from playing
    const audioContext = new OfflineAudioContext({
        numberOfChannels: 1,
        length: 1, // Placeholder, will be updated
        sampleRate: targetSampleRate
    });

    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const offlineContext = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            Math.ceil(audioBuffer.duration * targetSampleRate),
            targetSampleRate
        );

        const bufferSource = offlineContext.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(offlineContext.destination);
        bufferSource.start(0);

        const renderedBuffer = await offlineContext.startRendering();
        return audioBufferToWav(renderedBuffer);
    } catch (error) {
        logMessage(`Error resampling ${file.name}: ${error.message}`, 'error');
        throw error;
    }
}

function audioBufferToWav(audioBuffer) {
    const nChannels = audioBuffer.numberOfChannels;
    if (nChannels !== 1 && nChannels !== 2) {
        throw new Error('Expecting mono or stereo audioBuffer');
    }

    const bufferLength = audioBuffer.length;
    const arrayBuffer = new ArrayBuffer(HEADER_LENGTH + 2 * bufferLength * nChannels);
    const view = new DataView(arrayBuffer);
    const int16 = new Int16Array(arrayBuffer);

    const sr = audioBuffer.sampleRate;
    const l2 = bufferLength * nChannels * 2;
    const l1 = l2 + 36;
    const br = sr * nChannels * 2;

    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, l1, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    // "fmt " sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (PCM)
    view.setUint16(22, nChannels, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, br, true);
    view.setUint16(32, nChannels * 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    // "data" sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, l2, true);

    const buffers = [];
    for (let channel = 0; channel < nChannels; channel++) {
        buffers.push(audioBuffer.getChannelData(channel));
    }

    for (let i = 0, index = HEADER_LENGTH / 2; i < bufferLength; i++) {
        for (let channel = 0; channel < nChannels; channel++) {
            let sample = buffers[channel][i];
            sample = Math.min(1, Math.max(-1, sample));
            sample = Math.round(sample * MAX_AMPLITUDE);
            int16[index++] = sample;
        }
    }

    return new Blob([view], { type: 'audio/wav' });
}


function sanitizeName(name) {
    // Removes file extension and sanitizes
    const nameWithoutExt = name.split('.').slice(0, -1).join('.');
    return nameWithoutExt.replace(/[^a-zA-Z0-9 #\-().]+/g, '').trim();
}

function sanitizeForPath(name) {
     return name.replace(/[^a-zA-Z0-9 \-().]+/g, '').trim();
}


function parseFilename(filename) {
    const fileNameWithoutExtension = filename.split('.').slice(0, -1).join('.');
    const parts = fileNameWithoutExtension.split(/[\s_-]+/);
    let baseNameParts = [];
    let midiValue = null;
    const notePattern = /([A-G][b#]?)(\d+)/i;

    for (const part of parts) {
        const noteMatch = part.match(notePattern);
        if (noteMatch) {
            const noteName = noteMatch[1];
            const octave = parseInt(noteMatch[2], 10);
            const fullNoteString = `${noteName}${octave}`;
            midiValue = noteStringToMidiValue(fullNoteString);
            break;
        }
        if (!/^\d+$/.test(part)) {
            baseNameParts.push(part);
        }
    }
    const baseName = baseNameParts.join(' ');
    if (midiValue !== null) {
        return [sanitizeName(baseName), midiValue];
    } else {
        throw new Error(`Filename '${filename}' does not contain a recognizable pitch (e.g., A#3, C4).`);
    }
}

const NOTE_OFFSET = [33, 35, 24, 26, 28, 29, 31];
function noteStringToMidiValue(note) {
    const string = note.replace(' ', '');
    if (string.length < 2) throw new Error("Bad note format");

    const noteIdx = string[0].toUpperCase().charCodeAt(0) - 65;
    if (noteIdx < 0 || noteIdx > 6) throw new Error("Bad note");

    let sharpen = 0;
    if (string[1] === "#") sharpen = 1;
    else if (string[1].toLowerCase() === "b") sharpen = -1;
    
    return parseInt(string.slice(1 + Math.abs(sharpen)), 10) * 12 + NOTE_OFFSET[noteIdx] + sharpen;
}

const baseMultisampleJson = {
    "engine": { "bendrange": 13653, "highpass": 0, "modulation": { "aftertouch": { "amount": 30719, "target": 4096 }, "modwheel": { "amount": 32767, "target": 10240 }, "pitchbend": { "amount": 16383, "target": 0 }, "velocity": { "amount": 16383, "target": 0 } }, "params": [16384, 16384, 16384, 16384, 16384, 16384, 16384, 16384], "playmode": "poly", "portamento.amount": 0, "portamento.type": 32767, "transpose": 0, "tuning.root": 0, "tuning.scale": 0, "velocity.sensitivity": 10240, "volume": 16466, "width": 3072 },
    "envelope": { "amp": { "attack": 0, "decay": 20295, "release": 16383, "sustain": 14989 }, "filter": { "attack": 0, "decay": 16895, "release": 19968, "sustain": 16896 } },
    "fx": { "active": false, "params": [19661, 0, 7391, 24063, 0, 32767, 0, 0], "type": "svf" },
    "lfo": { "active": false, "params": [19024, 32255, 4048, 17408, 0, 0, 0, 0], "type": "element" },
    "octave": 0, "platform": "OP-XY", "regions": [], "type": "multisampler", "version": 4
};

// --- UI & App Logic ---

const selectFolderButton = document.getElementById('select-folder-button');
const selectLibraryButton = document.getElementById('select-library-button');
const convertButton = document.getElementById('convert-button');
const testRunCheckbox = document.getElementById('test-run-checkbox');
const logContainer = document.getElementById('log-container');
const resultsContainer = document.getElementById('results-container');
const fileCountEl = document.getElementById('file-count');

let instruments = {};
let generatedPresetNames = new Set();

function logMessage(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (type === 'error') {
        p.className = 'text-red-600';
    } else if (type === 'success') {
        p.className = 'text-green-600';
    } else if (type === 'final') {
        p.className = 'font-bold text-blue-700';
    } else {
        p.className = 'text-gray-800';
    }
    logContainer.appendChild(p);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLogs() {
    logContainer.innerHTML = '';
}

function clearResults() {
    resultsContainer.innerHTML = '';
}

function getPackShortName(packName) {
    const words = packName.split(/\s+/);
    if (words.length > 1) {
        return words.map(word => word.charAt(0).toUpperCase()).join('');
    }
    return packName.substring(0, 3).toUpperCase();
}

async function findInstrumentsDirectory(packHandle, packShortName) {
    for await (const entry of packHandle.values()) {
        if (entry.kind === 'directory' && entry.name === 'Samples') {
            for await (const subEntry of entry.values()) {
                if (subEntry.kind === 'directory' && subEntry.name === 'Instruments') {
                    await processDirectory(subEntry, packShortName);
                    return;
                }
            }
        }
    }
}

selectLibraryButton.addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
        logMessage('Your browser does not support the File System Access API.', 'error');
        return;
    }
    try {
        const dirHandle = await window.showDirectoryPicker();
        instruments = {};
        generatedPresetNames.clear();
        clearLogs();
        clearResults();
        fileCountEl.textContent = '';
        convertButton.disabled = true;

        logMessage(`Scanning library: ${dirHandle.name}...`);

        for await (const packHandle of dirHandle.values()) {
            if (packHandle.kind === 'directory') {
                logMessage(`Searching for instruments in pack: ${packHandle.name}`);
                await findInstrumentsDirectory(packHandle, getPackShortName(packHandle.name));
            }
        }

        const instrumentCount = Object.keys(instruments).length;
        fileCountEl.textContent = `${instrumentCount} instrument(s) found.`;
        logMessage(`Scan complete. Found ${instrumentCount} instrument(s).`, 'success');

        if (instrumentCount > 0) {
            convertButton.disabled = false;
        } else {
            logMessage('No valid instrument packs found.', 'error');
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            logMessage(`Error selecting directory: ${err.message}`, 'error');
        }
    }
});

async function processDirectory(dirHandle, packName, path = '') {
   for await (const entry of dirHandle.values()) {
       const currentPath = path ? `${path}/${entry.name}` : entry.name;
       if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.wav')) {
           const instrumentName = path; 
           if (!instruments[instrumentName]) {
               instruments[instrumentName] = { files: [], pack: packName };
           }
           instruments[instrumentName].files.push(entry);
       } else if (entry.kind === 'directory') {
           await processDirectory(entry, packName, currentPath);
       }
   }
}

selectFolderButton.addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
        logMessage('Your browser does not support the File System Access API. Please use a modern browser like Chrome or Edge.', 'error');
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker();
        instruments = {};
        generatedPresetNames.clear();
        clearLogs();
        clearResults();
        fileCountEl.textContent = '';
        convertButton.disabled = true;
        convertButton.classList.add('bg-gray-400', 'cursor-not-allowed');
        convertButton.classList.remove('bg-green-600', 'hover:bg-green-700');
        
        logMessage(`Scanning directory: ${dirHandle.name}...`);
        await processDirectory(dirHandle, null);

        const instrumentCount = Object.keys(instruments).length;
        fileCountEl.textContent = `${instrumentCount} instrument(s) found.`;
        logMessage(`Scan complete. Found ${instrumentCount} instrument(s).`, 'success');

        if (instrumentCount > 0) {
            convertButton.disabled = false;
            convertButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
            convertButton.classList.add('bg-green-600', 'hover:bg-green-700');
        } else {
             logMessage('No instrument folders with .wav files found in the selected directory.', 'error');
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            logMessage(`Error selecting directory: ${err.message}`, 'error');
        }
    }
});

convertButton.addEventListener('click', async () => {
     logMessage('Starting conversion process...');
     const isTestRun = testRunCheckbox.checked;
     let instrumentEntries = Object.entries(instruments);
     const mainZip = new JSZip();

     if (isTestRun && instrumentEntries.length > 0) {
         logMessage('Test run enabled. Processing first instrument only.');
         instrumentEntries = [instrumentEntries[0]];
     }
    generatedPresetNames.clear();
     for (const [instrumentPath, instrumentData] of instrumentEntries) {
         await addPresetToZip(mainZip, instrumentPath, instrumentData.files, instrumentData.pack);
     }
     
     logMessage('All instruments processed. Generating final ZIP file...', 'final');

     const zipBlob = await mainZip.generateAsync({ type: "blob" });
     const downloadUrl = URL.createObjectURL(zipBlob);
     const finalZipName = `zzm-presets-all.zip`;
     addResultLink(finalZipName, downloadUrl);
     logMessage(`Successfully created ${finalZipName}.`, 'success');
});

function generateFinalPresetName(baseName) {
    let finalName = baseName;
    let counter = 1;
    while (generatedPresetNames.has(finalName)) {
        const suffix = `-${counter}`;
        finalName = baseName.substring(0, 20 - suffix.length) + suffix;
        counter++;
    }
    generatedPresetNames.add(finalName);
    return finalName;
}


async function addPresetToZip(mainZip, instrumentPath, wavFileHandles, packShortName = null) {
    const pathParts = instrumentPath.split('/');
    const instrumentName = pathParts.pop() || 'Unnamed';
    const instrumentType = pathParts.length > 0 ? pathParts.pop() : 'Misc';

    const cleanedInstrumentName = sanitizeForPath(instrumentName.replace(/ samples?/i, '').trim())
        .replace(/\s+/g, '-');

    let basePresetName;
    if (packShortName) {
        basePresetName = `zzm-${packShortName}-${cleanedInstrumentName}`;
    } else {
        basePresetName = `zzm-${cleanedInstrumentName}`;
    }

    if (basePresetName.length > 20) {
        basePresetName = basePresetName.substring(0, 20);
    }

    const finalPresetName = generateFinalPresetName(basePresetName);

    const soundTypeFolder = `zzm-${sanitizeForPath(instrumentType)}`;
    const presetFolderName = `${soundTypeFolder}/${finalPresetName}.preset`;

    logMessage(`Processing instrument: ${instrumentName} (Type: ${instrumentType}, Pack: ${packShortName || 'N/A'})`);
    
    const patchJson = JSON.parse(JSON.stringify(baseMultisampleJson));
    const targetSampleRate = 22050;
    let samplesData = [];

    // 1. Parse all filenames
    for (const fileHandle of wavFileHandles) {
        try {
            const [baseName, midiValue] = parseFilename(fileHandle.name);
            samplesData.push({ handle: fileHandle, midi: midiValue, baseName: baseName });
        } catch (e) {
            logMessage(`- Skipping ${fileHandle.name}: ${e.message}`, 'error');
        }
    }

    // 2. Sort by MIDI note
    samplesData.sort((a, b) => a.midi - b.midi);

    // 3. Assign key ranges
    let lastKey = 0;
    samplesData.forEach(sample => {
        sample.lokey = lastKey;
        sample.hikey = sample.midi;
        lastKey = sample.midi + 1;
    });
    if (samplesData.length > 0) {
        samplesData[samplesData.length - 1].hikey = 127;
    }

    // 4. Process and resample each file, returning the region data
    const regionPromises = samplesData.map(async (sample) => {
        const file = await sample.handle.getFile();
        const sanitizedSampleName = sanitizeName(file.name) + '.wav';
        logMessage(`  - Resampling ${file.name}`);

        const resampledWavBlob = await resampleAudio(file, targetSampleRate);
        
        const presetFilePath = `${presetFolderName}/${sanitizedSampleName}`;
        mainZip.file(presetFilePath, resampledWavBlob);
        
        const tempCtx = new AudioContext();
        const arrayBuffer = await resampledWavBlob.arrayBuffer();
        const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
        const duration = audioBuffer.duration;
        await tempCtx.close();
        const framecount = Math.floor(duration * targetSampleRate);

        // Return the region object instead of pushing it directly
        return {
            framecount: framecount, gain: 0, hikey: sample.hikey, lokey: sample.lokey,
            "loop.crossfade": 0, "loop.end": framecount, "loop.onrelease": false,
            "loop.enabled": false, "loop.start": 0, "pitch.keycenter": sample.midi,
            reverse: false, sample: sanitizedSampleName, "sample.end": framecount,
            "sample.start": 0, tune: 0
        };
    });

    // 5. Wait for all regions to be processed
    const generatedRegions = await Promise.all(regionPromises);

    // 6. IMPORTANT: Sort the final regions array by lokey
    generatedRegions.sort((a, b) => a.lokey - b.lokey);
    
    // 7. Assign the correctly sorted regions to the JSON
    patchJson.regions = generatedRegions;
    
    // Add patch.json to the preset folder within the main zip
    const patchJsonPath = `${presetFolderName}/patch.json`;
    mainZip.file(patchJsonPath, JSON.stringify(patchJson, null, 2));
}

function addResultLink(filename, url) {
    if (resultsContainer.querySelector('p')) {
        resultsContainer.innerHTML = ''; // Clear initial message
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.textContent = filename;
    link.className = 'block bg-green-100 text-green-800 font-medium py-2 px-4 rounded-lg hover:bg-green-200 transition';
    
    resultsContainer.appendChild(link);
}
