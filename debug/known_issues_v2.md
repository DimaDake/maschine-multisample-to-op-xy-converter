# Known Conversion Issues (v2)

This document outlines known issues where the conversion from NI library format to OP-XY patches fails or produces incorrect results, based on analysis of the conversion script and sample library structures.

## Issue 1: Incorrect MIDI Pitch Mapping

**Problem:** The script incorrectly calculates the MIDI note value from sample filenames. The calculated value is consistently one octave (12 semitones) higher than the standard MIDI note value. This causes all converted instruments to sound an octave higher than they should, making the patches musically inaccurate.

**Details:** The `noteStringToMidiValue` function in `src/main.js` uses a set of offsets that results in, for example, C4 being mapped to MIDI note 72 instead of the standard 60.

**Example:**
*   **Input Sample:** A file named `SomeBass C2.wav`.
*   **Current Behavior:** The script calculates the MIDI value for C2 as 48. The sample is mapped to MIDI note 48 in the `patch.json`.
*   **Expected Behavior:** The standard MIDI value for C2 is 36. The resulting instrument plays back at the wrong pitch.

## Issue 2: Flawed Instrument Sample Grouping

**Problem:** The script assumes that all `.wav` files for a single instrument reside in one flat directory. It cannot correctly process NI libraries where samples for one instrument are organized into subdirectories (e.g., for different velocity layers or articulations). The script treats each subdirectory containing samples as a completely separate instrument.

**Example:**
*   **Input Structure (from `debug/ni_folder_structure.txt`):** The `Scarbee MM-Bass Library` contains samples in nested folders for different velocity layers:
    ```
    /Scarbee MM-Bass Library/Samples/MM-Bass Amped/
    ├── V1/
    │   ├── A1.wav
    │   └── ...
    ├── V2/
    │   ├── A1.wav
    │   └── ...
    ```
*   **Current Behavior:** The script would generate two separate and incomplete instruments, such as `zzm-SML-MM-Bass-Amped-V1.preset` and `zzm-SML-MM-Bass-Amped-V2.preset`.
*   **Expected Behavior:** The script should create a single, complete instrument (e.g., `zzm-SML-MM-Bass-Amped.preset`) that combines all samples from the `V1` and `V2` subdirectories into one multi-sampled patch.

## Issue 3: Confusing Preset Names from Truncation

**Problem:** The script truncates all generated preset names to a maximum of 20 characters. When this creates a name collision with a previously generated preset, the script resolves it by further truncating the name and appending a number (e.g., `-1`). This process results in preset names that are cryptic and do not clearly represent the original instrument.

**Example:**
*   **Input Structure (from `debug/ni_folder_structure.txt`):** Two folders from the `Indigodust Dust Library` (which seems to have the short name `IDL` in the output): `Bass Barraland 1` and `Bass Barraland 2`.
*   **Current Behavior (from `debug/conversion_results_dump.txt`):**
    1.  `Bass Barraland 1` becomes `zzm-IDL-Bass-Barrala.preset`.
    2.  `Bass Barraland 2` also truncates to the same name, creating a collision. The script resolves this by creating `zzm-IDL-Bass-Barra-1.preset`.
*   **Result:** The final preset names are confusing and it is not obvious which name corresponds to which original instrument folder. This makes managing and using the generated patches difficult.
