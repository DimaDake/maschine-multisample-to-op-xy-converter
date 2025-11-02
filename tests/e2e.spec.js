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
  const soundTypeFolder = `zzm-${soundType}`;
  const presetName = `zzm-${instrumentName}.preset`;
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
  expect(generatedPatch.regions[0]['pitch.keycenter']).toBe(48); // C2
  expect(generatedPatch.regions[1].sample).toBe('TestBass b2.wav');
  expect(generatedPatch.regions[1]['pitch.keycenter']).toBe(59); // B2

  // 3. Verify WAV files exist
  const generatedWav1 = generatedZip.getEntry(`${presetPath}/TestBass b2.wav`);
  const generatedWav2 = generatedZip.getEntry(`${presetPath}/TestBass c2.wav`);
  expect(generatedWav1).not.toBeNull();
  expect(generatedWav2).not.toBeNull();

  // Clean up the downloaded file
  fs.unlinkSync(tempFilePath);
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
                      'Long Instrument Name That Will Be Truncated': {
                        name: 'Long Instrument Name That Will Be Truncated',
                        kind: 'directory',
                        entries: {
                          'sample1 a1.wav': {
                            name: 'sample1 a1.wav',
                            kind: 'file',
                            path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass c2.wav' // Using existing file for mock
                          }
                        }
                      },
                      'Long Instrument Name That Will Be Truncated Also': {
                         name: 'Long Instrument Name That Will Be Truncated Also',
                         kind: 'directory',
                         entries: {
                           'sample2 b1.wav': {
                             name: 'sample2 b1.wav',
                             kind: 'file',
                             path: 'tests/data/Samples/Instruments/Bass/TestBass/TestBass b2.wav' // Using existing file for mock
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

  const convertButton = page.locator('#convert-button');
  await expect(convertButton).toBeEnabled();
  await expect(convertButton).toHaveClass(/bg-green-600/);

  await convertButton.click();

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
    'zzm-Keys/zzm-M2L-Piano-Reso.preset/patch.json',
    'zzm-Bass/',
    'zzm-Bass/zzm-AP-Long-Instrume.preset/',
    'zzm-Bass/zzm-AP-Long-Instrume.preset/sample1 a1.wav',
    'zzm-Bass/zzm-AP-Long-Instrume.preset/patch.json',
    'zzm-Bass/zzm-AP-Long-Instru-1.preset/',
    'zzm-Bass/zzm-AP-Long-Instru-1.preset/sample2 b1.wav',
    'zzm-Bass/zzm-AP-Long-Instru-1.preset/patch.json',
  ].sort();

  expect(generatedEntries).toEqual(expectedEntries);

  fs.unlinkSync(tempFilePath);
});