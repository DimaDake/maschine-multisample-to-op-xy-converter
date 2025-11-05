# Known Issues and Suggestions

This document outlines the identified bugs and potential issues found by analyzing the NI library structure and the conversion results.

## Bugs

### 1. Preset Name Truncation

There is a consistent issue where the generated `.preset` folder names are truncated, likely due to a character limit in the conversion script. This results in incomplete and sometimes confusing preset names.

**Examples:**

- `zzm-BJL-Bass-Midnigh.preset` (should be `...-Midnight.preset`)
- `zzm-BJL-Bass-Starry-.preset` (should be `...-Starry-Night.preset`)
- `zzm-M2L-AnalogClassi.preset` (should be `...-AnalogClassicA.preset`)
- `zzm-M2L-Upright-Ba-1.preset` (should be `...-Upright-Bass-1.preset`)
- `zzm-TSL-VintageSawBa.preset` (should be `...-VintageSawBass.preset`)

**Recommendation:** The filename length limitation should be removed or increased to accommodate the full, descriptive names from the source library.

### 2. Inconsistent Sample Filename Parsing

The script fails to consistently parse sample names and their associated musical notes, leading to several distinct errors.

#### a. Missing Space Between Name and Note

In some presets, the space between the sample's base name and its note/octave is missing.

- **Preset:** `zzm-DML-Suzuki.preset`
- **Incorrect Filenames:** `SuzukiC0.wav`, `SuzukiF#1.wav`
- **Correct Filenames (based on other presets):** `Suzuki C0.wav`, `Suzuki F#1.wav`

#### b. Incorrect Hyphen Placement

In some cases, a hyphen is incorrectly inserted within the note name itself, suggesting a flawed parsing logic for notes containing sharps (`#`) or flats (`b`).

- **Preset:** `zzm-M2L-Dirt-Bass.preset`
- **Incorrect Filenames:** `Dirt Bass-a#1.wav`, `Dirt Bass-g#2.wav`
- **Expected Filenames:** `Dirt Bass a#1.wav`, `Dirt Bass g#2.wav`

#### c. Inconsistent Capitalization

Sample filenames are not capitalized consistently across different presets. Some are properly capitalized, while others are all lowercase.

- **Preset:** `zzm-M2L-Adrenaline.preset`
- **Incorrect Filenames:** `adrenaline a1.wav`, `adrenaline c2.wav`
- **Expected Filenames:** `Adrenaline A1.wav`, `Adrenaline C2.wav`

**Recommendation:** The sample filename parsing logic needs to be revised to be more robust. It should correctly handle spaces, special characters like `#`, and enforce a consistent capitalization scheme for all output sample files.

## Suggestions / Potential Issues

### 1. Lack of Support for Drum Kits and `.nki` Files

The analysis suggests that the converter may exclusively target snapshot files (`.nksn`) and ignore other instrument formats like Kontakt Instruments (`.nki`).

For example, the `Abbey Road 60s Drummer Library` is present in the input source but does not appear in the conversion results dump. This library contains `.nki` files for its drum kits.

**Recommendation:** Investigate adding support for `.nki` based instruments, especially drum kits. If this is an intentional limitation, it should be clearly documented for users.
