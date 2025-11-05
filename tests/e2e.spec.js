const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

test('should generate the correct zip file', async ({ page }) => {
  test.setTimeout(60000);
  // Listen for any console messages from the page and log them to the terminal
  page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`), );

  const mockStructure = {
    name: 'Instruments',
    kind: 'directory',
    entries: {
      'Bass': {
        name: 'Bass',
        kind: 'directory',
        entries: {
          'TestBass': {
            name: 'TestBass',
            kind: 'directory',
            entries: {
              'TestBass b2.wav': {
                name: 'TestBass b2.wav',
                kind: 'file',
                path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass b2.wav'
              },
              'TestBass c2.wav': {
                name: 'TestBass c2.wav',
                kind: 'file',
                path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass c2.wav'
              }
            }
          }
        }
      }
    }
  };

  await page.route('**/__playwright_mock_file__/**', (route, request) => {
    const requestedPath = decodeURIComponent(request.url().split('/__playwright_mock_file__/')[1]);
    const filePath = path.resolve(__dirname, '..', requestedPath);
    if (fs.existsSync(filePath)) {
      return route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: fs.readFileSync(filePath)
      });
    }
    return route.fulfill({ status: 404 });
  });

  await page.addInitScript((mockStructure) => {
    function createMockHandle(entry) {
      return {
        name: entry.name,
        kind: entry.kind,
        async *[Symbol.asyncIterator]() {
          if (entry.kind === 'directory') {
            for (const child of Object.values(entry.entries)) {
              yield createMockHandle(child);
            }
          }
        },
        values() {
          return this[Symbol.asyncIterator]();
        },
        async getFile() {
          if (this.kind === 'file') {
            const response = await fetch(`/__playwright_mock_file__/${entry.path}`);
            const blob = await response.blob();
            return new File([blob], this.name, { type: 'audio/wav' });
          }
          throw new Error('Not a file');
        }
      };
    }

    window.showDirectoryPicker = async () => {
      return createMockHandle(mockStructure);
    };
  }, mockStructure);

  await page.goto('/index.html');

  await page.locator('#select-folder-button').click();

  await expect(page.locator('#file-count')).toHaveText('1 instrument(s) found.', { timeout: 10000 });

  await expect(page.locator('#convert-button')).toBeEnabled();

  // Set a custom prefix
  await page.locator('#prefix-input').fill('custom');

  // Click the button to generate the zip. This starts a long-running process.
  await page.locator('#convert-button').click();

  // Wait for the download link to appear, giving it a long timeout because resampling can be slow.
  const downloadLink = page.locator('#results-container a');
  await downloadLink.waitFor({ state: 'visible', timeout: 60000 });

  // Now that the link is visible, start waiting for the download and then click the link.
  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloadPromise;
  const tempFilePath = path.join(__dirname, 'temp-download.zip');
  await download.saveAs(tempFilePath);

  // --- Verification ---
  const generatedZip = new AdmZip(tempFilePath);
  const generatedEntries = generatedZip.getEntries().map(e => e.entryName).sort();

  // 1. Verify the file structure inside the zip
  const soundType = 'Bass';
  const instrumentName = 'TestBass';
  const soundTypeFolder = `custom-${soundType}`;
  const presetName = `custom-${instrumentName}.preset`;
  const presetPath = `${soundTypeFolder}/${presetName}`;
  const expectedEntries = [
    `${soundTypeFolder}/`,
    `${presetPath}/`,
    `${presetPath}/TestBass b2.wav`,
    `${presetPath}/TestBass c2.wav`,
    `${presetPath}/patch.json`,
  ].sort();
  expect(generatedEntries).toEqual(expectedEntries);

  // 2. Verify the content of patch.json
  const generatedPatch = JSON.parse(generatedZip.readAsText(`${presetPath}/patch.json`));
  expect(generatedPatch.type).toBe('multisampler');
  expect(generatedPatch.regions.length).toBe(2);

  // Note: The regions are sorted by MIDI note value (C2 < B2)
  expect(generatedPatch.regions[0].sample).toBe('TestBass c2.wav');
  expect(generatedPatch.regions[0]['pitch.keycenter']).toBe(36); // C2
  expect(generatedPatch.regions[1].sample).toBe('TestBass b2.wav');
  expect(generatedPatch.regions[1]['pitch.keycenter']).toBe(47); // B2

  // 3. Verify WAV files exist
  const generatedWav1 = generatedZip.getEntry(`${presetPath}/TestBass b2.wav`);
  const generatedWav2 = generatedZip.getEntry(`${presetPath}/TestBass c2.wav`);
  expect(generatedWav1).not.toBeNull();
  expect(generatedWav2).not.toBeNull();

  // Clean up the downloaded file
  fs.unlinkSync(tempFilePath);
});

test('should correctly calculate MIDI pitch values', async ({ page }) => {
  test.setTimeout(60000);
  page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));

  const mockStructure = {
    name: 'Instruments',
    kind: 'directory',
    entries: {
      'PitchTest': {
        name: 'PitchTest',
        kind: 'directory',
        entries: {
          'Pitch Test': {
            name: 'Pitch Test',
            kind: 'directory',
            entries: {
              'PitchTest C4.wav': {
                name: 'PitchTest C4.wav',
                kind: 'file',
                path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass c2.wav' // Re-use existing file data
              },
              'PitchTest A4.wav': {
                name: 'PitchTest A4.wav',
                kind: 'file',
                path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass b2.wav' // Re-use existing file data
              }
            }
          }
        }
      }
    }
  };

  await page.route('**/__playwright_mock_file__/**', (route, request) => {
    const requestedPath = decodeURIComponent(request.url().split('/__playwright_mock_file__/')[1]);
    const filePath = path.resolve(__dirname, '..', requestedPath);
    if (fs.existsSync(filePath)) {
      return route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: fs.readFileSync(filePath)
      });
    }
    return route.fulfill({ status: 404 });
  });

  await page.addInitScript((mockStructure) => {
    function createMockHandle(entry) {
      return {
        name: entry.name,
        kind: entry.kind,
        async *[Symbol.asyncIterator]() {
          if (entry.kind === 'directory') {
            for (const child of Object.values(entry.entries)) {
              yield createMockHandle(child);
            }
          }
        },
        values() {
          return this[Symbol.asyncIterator]();
        },
        async getFile() {
          if (this.kind === 'file') {
            const response = await fetch(`/__playwright_mock_file__/${entry.path}`);
            const blob = await response.blob();
            return new File([blob], this.name, { type: 'audio/wav' });
          }
          throw new Error('Not a file');
        }
      };
    }

    window.showDirectoryPicker = async () => {
      return createMockHandle(mockStructure);
    };
  }, mockStructure);

  await page.goto('/index.html');

  await page.locator('#select-folder-button').click();

  await expect(page.locator('#file-count')).toHaveText('1 instrument(s) found.', { timeout: 10000 });

  await page.locator('#convert-button').click();

  const downloadLink = page.locator('#results-container a');
  await downloadLink.waitFor({ state: 'visible', timeout: 60000 });

  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloadPromise;
  const tempFilePath = path.join(__dirname, 'temp-pitch-test.zip');
  await download.saveAs(tempFilePath);

  // --- Verification ---
  const generatedZip = new AdmZip(tempFilePath);
  const presetPath = 'zzm-PitchTest/zzm-Pitch-Test.preset';
  
  // Verify the content of patch.json
  const generatedPatch = JSON.parse(generatedZip.readAsText(`${presetPath}/patch.json`));
  expect(generatedPatch.regions.length).toBe(2);

  const regionC4 = generatedPatch.regions.find(r => r.sample === 'PitchTest C4.wav');
  const regionA4 = generatedPatch.regions.find(r => r.sample === 'PitchTest A4.wav');

  expect(regionC4).toBeDefined();
  expect(regionA4).toBeDefined();

  // Assert correct MIDI values
  expect(regionC4['pitch.keycenter']).toBe(60); // C4 should be MIDI note 60
  expect(regionA4['pitch.keycenter']).toBe(69); // A4 should be MIDI note 69

  fs.unlinkSync(tempFilePath);
});

test('should save the correct folder structure using File System Access API', async ({ page }) => {
  test.setTimeout(60000);
  page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));

  const mockStructure = {
    name: 'Instruments',
    kind: 'directory',
    entries: {
      'Bass': {
        name: 'Bass',
        kind: 'directory',
        entries: {
          'TestBass': {
            name: 'TestBass',
            kind: 'directory',
            entries: {
              'TestBass b2.wav': { name: 'TestBass b2.wav', kind: 'file', path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass b2.wav' },
              'TestBass c2.wav': { name: 'TestBass c2.wav', kind: 'file', path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass c2.wav' }
            }
          }
        }
      }
    }
  };

  await page.route('**/__playwright_mock_file__/**', (route, request) => {
    const requestedPath = decodeURIComponent(request.url().split('/__playwright_mock_file__/')[1]);
    const filePath = path.resolve(__dirname, '..', requestedPath);
    if (fs.existsSync(filePath)) {
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: fs.readFileSync(filePath) });
    }
    return route.fulfill({ status: 404 });
  });

  await page.addInitScript((mockStructure) => {
    // This array will store a log of all file system operations.
    window.fileSystemAccessLog = [];

    function createMockFileHandle(path) {
      return {
        async createWritable() {
          return {
            async write(content) {
              window.fileSystemAccessLog.push({ type: 'file', path, content: typeof content === 'string' ? JSON.parse(content) : 'binary_wav_data' });
            },
            async close() { /* no-op */ }
          };
        }
      };
    }

    function createMockDirectoryHandle(path) {
      return {
        name: path.split('/').pop(),
        kind: 'directory',
        async getDirectoryHandle(name, options) {
          window.fileSystemAccessLog.push({ type: 'dir', path: `${path}/${name}` });
          return createMockDirectoryHandle(`${path}/${name}`);
        },
        async getFileHandle(name, options) {
           return createMockFileHandle(`${path}/${name}`);
        }
      };
    }

    function createMockHandle(entry) {
        if (entry.kind === 'file') {
            return {
                name: entry.name,
                kind: entry.kind,
                async getFile() {
                    const response = await fetch(`/__playwright_mock_file__/${entry.path}`);
                    return new File([await response.blob()], entry.name, { type: 'audio/wav' });
                }
            };
        }
        return {
            name: entry.name,
            kind: entry.kind,
            async *[Symbol.asyncIterator]() {
                if (entry.kind === 'directory') {
                    for (const child of Object.values(entry.entries)) {
                        yield createMockHandle(child);
                    }
                }
            },
            values() { return this[Symbol.asyncIterator](); },
        };
    }

    // Mock picker for reading files
    const originalShowDirectoryPicker = window.showDirectoryPicker;
    window.showDirectoryPicker = async () => {
        // This is a simplified mock. We check a global flag to decide if this
        // is the 'open' call or the 'save' call.
        if (window.isSaving) {
            window.isSaving = false;
            return createMockDirectoryHandle('root');
        }
        return createMockHandle(mockStructure);
    };

  }, mockStructure);

  await page.goto('/index.html');

  // 1. Select folder and verify instruments are found
  await page.locator('#select-folder-button').click();
  await expect(page.locator('#file-count')).toHaveText('1 instrument(s) found.');
  await expect(page.locator('#save-folder-button')).toBeVisible();
  await expect(page.locator('#save-folder-button')).toBeEnabled();

  // 2. Click the save button
  await page.evaluate(() => { window.isSaving = true; }); // Set flag for our mock
  await page.locator('#prefix-input').fill('custom');
  await page.locator('#save-folder-button').click();

  // 3. Wait for the process to complete
  await expect(page.locator('p:text("All instruments processed and saved.")')).toBeVisible({ timeout: 30000 });

  // 4. Verify the file system operations
  const log = await page.evaluate(() => window.fileSystemAccessLog);

  expect(log.some(entry => entry.type === 'dir' && entry.path === 'root/custom-Bass')).toBe(true);
  expect(log.some(entry => entry.type === 'dir' && entry.path === 'root/custom-Bass/custom-TestBass.preset')).toBe(true);

  const patchFile = log.find(entry => entry.type === 'file' && entry.path === 'root/custom-Bass/custom-TestBass.preset/patch.json');
  expect(patchFile).toBeDefined();
  expect(patchFile.content.regions.length).toBe(2);
  expect(patchFile.content.regions[0].sample).toBe('TestBass c2.wav');
  expect(patchFile.content.regions[1].sample).toBe('TestBass b2.wav');

  const wavFile1 = log.find(entry => entry.type === 'file' && entry.path === 'root/custom-Bass/custom-TestBass.preset/TestBass c2.wav');
  expect(wavFile1).toBeDefined();
  expect(wavFile1.content).toBe('binary_wav_data');

  const wavFile2 = log.find(entry => entry.type === 'file' && entry.path === 'root/custom-Bass/custom-TestBass.preset/TestBass b2.wav');
  expect(wavFile2).toBeDefined();
  expect(wavFile2.content).toBe('binary_wav_data');
});

test('should handle NI library structure with pack names', async ({ page }) => {
  test.setTimeout(120000); // Increased timeout for potentially longer processing
  page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));

  const mockLibraryStructure = {
    name: 'Native Instruments',
    kind: 'directory',
    entries: {
      'Maschine 2 Library': {
        name: 'Maschine 2 Library',
        kind: 'directory',
        entries: {
          'Samples': {
            name: 'Samples',
            kind: 'directory',
            entries: {
              'Instruments': {
                name: 'Instruments',
                kind: 'directory',
                entries: {
                  'Keys': {
                    name: 'Keys',
                    kind: 'directory',
                    entries: {
                      'Piano Reso Samples': {
                        name: 'Piano Reso Samples',
                        kind: 'directory',
                        entries: {
                          'Piano Reso G3.wav': {
                            name: 'Piano Reso G3.wav',
                            kind: 'file',
                            path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass c2.wav' // Use existing file to avoid 404
                          },
                          'Piano Reso A3.wav': {
                            name: 'Piano Reso A3.wav',
                            kind: 'file',
                            path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass b2.wav' // Use existing file to avoid 404
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      'Another Pack': {
        name: 'Another Pack',
        kind: 'directory',
        entries: {
          'Samples': {
            name: 'Samples',
            kind: 'directory',
            entries: {
              'Instruments': {
                name: 'Instruments',
                kind: 'directory',
                entries: {
                  'Bass': {
                    name: 'Bass',
                    kind: 'directory',
                    entries: {
                      'TestBass': {
                        name: 'TestBass',
                        kind: 'directory',
                        entries: {
                          'TestBass b2.wav': {
                            name: 'TestBass b2.wav',
                            kind: 'file',
                            path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass b2.wav'
                          },
                          'TestBass c2.wav': {
                            name: 'TestBass c2.wav',
                            kind: 'file',
                            path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass c2.wav'
                          }
                        }
                      },
                      'Single Sample Instrument': {
                        name: 'Single Sample Instrument',
                        kind: 'directory',
                        entries: {
                          'single_sample c3.wav': {
                            name: 'single_sample c3.wav',
                            kind: 'file',
                            path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass c2.wav' // Use existing file for mock
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };


  await page.route('**/__playwright_mock_file__/**', (route, request) => {
    const requestedPath = decodeURIComponent(request.url().split('/__playwright_mock_file__/')[1]);
    const filePath = path.resolve(__dirname, '..', requestedPath);
    if (fs.existsSync(filePath)) {
      route.fulfill({ status: 200, contentType: 'audio/wav', body: fs.readFileSync(filePath) });
    } else {
      route.fulfill({ status: 404 });
    }
  });

  await page.addInitScript((mockStructure) => {
    function createMockHandle(entry) {
      return {
        name: entry.name,
        kind: entry.kind,
        async *[Symbol.asyncIterator]() {
          if (entry.kind === 'directory') {
            for (const child of Object.values(entry.entries)) {
              yield createMockHandle(child);
            }
          }
        },
        values() { return this[Symbol.asyncIterator](); },
        async getFile() {
          if (this.kind === 'file') {
            const response = await fetch(`/__playwright_mock_file__/${entry.path}`);
            return new File([await response.blob()], this.name, { type: 'audio/wav' });
          }
          throw new Error('Not a file');
        }
      };
    }
    window.showDirectoryPicker = async () => createMockHandle(mockStructure);
  }, mockLibraryStructure);

  await page.goto('/index.html');
  await page.locator('#select-library-button').click();
  await expect(page.locator('#file-count')).toHaveText('3 instrument(s) found.', { timeout: 20000 });
  await expect(page.locator('#convert-button')).toBeEnabled();
  await page.locator('#convert-button').click();

  const downloadLink = page.locator('#results-container a');
  await downloadLink.waitFor({ state: 'visible', timeout: 90000 });

  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloadPromise;
  const tempFilePath = path.join(__dirname, 'temp-library-download.zip');
  await download.saveAs(tempFilePath);

  // --- Verification ---
  const generatedZip = new AdmZip(tempFilePath);
  const generatedEntries = generatedZip.getEntries().map(e => e.entryName).sort();

  const expectedEntries = [
    'zzm-Keys/',
    'zzm-Keys/zzm-M2L-Piano-Reso.preset/',
    'zzm-Keys/zzm-M2L-Piano-Reso.preset/Piano Reso G3.wav',
    'zzm-Keys/zzm-M2L-Piano-Reso.preset/Piano Reso A3.wav',
    'zzm-Keys/zzm-M2L-Piano-Reso.preset/patch.json',
    'zzm-Bass/',
    'zzm-Bass/zzm-AP-TestBass.preset/',
    'zzm-Bass/zzm-AP-TestBass.preset/TestBass b2.wav',
    'zzm-Bass/zzm-AP-TestBass.preset/TestBass c2.wav',
    'zzm-Bass/zzm-AP-TestBass.preset/patch.json',
  ].sort();

  expect(generatedEntries).toEqual(expectedEntries);

  fs.unlinkSync(tempFilePath);
});