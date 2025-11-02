# Maschine Multisample to OP-XY Converter

A web-based tool to convert multisample NI Maschine instruments into OP-XY presets.

## Features

-   **Direct Browser Conversion:** Converts instrument packs directly in your browser.
-   **NI Library Support:** Handles both single instrument packs and full NI library structures.
-   **Sample Rate Selection:** Allows you to choose the output sample rate (11025, 22050, or 44100 Hz) to balance quality and performance.
-   **Automatic Naming:** Generates organized, prefixed preset names.
-   **Test Mode:** Includes a "Test Run" option to process only the first instrument, saving time.

## How to Use

1.  **Open the Converter:**
    -   Access the converter through the [live page](https://your-live-url.com).

2.  **Select Your Files:**
    -   Click **Select Native Instruments Pack** to convert a single instrument folder.
    -   Click **Select Native Instruments Library** to process a full library containing multiple packs.
    -   Your browser will ask for permission to access the folder. Navigate to and select the appropriate directory.

3.  **Configure Settings:**
    -   Choose your desired **Sample Rate** from the dropdown menu. 22050 Hz is a good default for compatibility.
    -   If you only want to process the first instrument found, check the **Test Run** box.

4.  **Generate Presets:**
    -   Click the **Generate Single ZIP** button.
    -   The application will scan the folders, resample the `.wav` files, and generate the preset structure.

5.  **Download:**
    -   A download link for the final `.zip` file will appear in the "Results" section.

## Development

To run this project locally:

1.  Clone the repository:
    ```bash
    git clone https://github.com/DimaDake/maschine-multisample-to-op-xy-converter.git
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the local server:
    ```bash
    npx http-server -p 3000 --cors
    ```
4.  Open `http://localhost:3000` in your browser.
