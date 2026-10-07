# Third-party notices

## Voom

Recordly Share includes code adapted from the Voom project:

- Project: [Voom](https://github.com/aritropaul/voom)
- Adapted component: `services/recordly-share/worker`
- License: MIT
- Copyright © 2026 Aritro Paul
- Upstream reference: `c1c0350ed610b0c9bc4a307fcc6a01aab0f926f9`

Recordly changes include product branding, desktop publishing integration,
authenticated commenting, local-development configuration, and viewer styling.

The Voom software is provided under the following license:

> MIT License
>
> Copyright (c) 2026 Aritro Paul
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Solar Icons

Solar Icon Set by 480 Design, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Source: https://github.com/480-Design/Solar-Icon-Set. Icons are rendered using the MIT-licensed `@solar-icons/react` package. The muted microphone adds a diagonal stroke.

## DM Sans

Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts).

DM Sans is licensed under the SIL Open Font License, Version 1.1. The unmodified regular and italic variable fonts are sourced from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/dmsans). The full license is included in [src/assets/fonts/dm-sans/OFL.txt](src/assets/fonts/dm-sans/OFL.txt).

## Kenney Interface Sounds

Click sounds "Soft", "Crisp", "Tick", "Tap" and "Toggle" are `click_001`, `click_003`, `tick_002`, `select_001` and `toggle_001` from [Interface Sounds 1.0](https://kenney.nl/assets/interface-sounds) by Kenney (www.kenney.nl), released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). They are embedded unmodified in `src/components/video-editor/clickSoundAssets.ts`. The "Default" click is synthesized in code.

## Background music library (public/music)

All tracks are from OpenGameArt.org and released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain; commercial use allowed, no attribution required). Files are unmodified, renamed only. License checked on each page on 2026-10-07.

| File | Title / author | Source page | Download URL | sha256 |
| --- | --- | --- | --- | --- |
| chill-lofi.mp3 | "Chill Lofi Inspired" by omfgdude | https://opengameart.org/content/chill-lofi-inspired | https://opengameart.org/sites/default/files/ChillLofiR_0.mp3 | 1796a480e3db0c02d5e58059b2ae7cfbeab344f95e0443496790da022cbe91b5 |
| field-of-dreams.mp3 | "The Field of Dreams" by pauliuw | https://opengameart.org/content/the-field-of-dreams | https://opengameart.org/sites/default/files/the_field_of_dreams.mp3 | 103a7032a49be7e8399c5cb771f7759eac9ac1a0d2bf227f41fff42ad8d78194 |
| next-to-you.mp3 | "Next to You" by Joth | https://opengameart.org/content/next-to-you | https://opengameart.org/sites/default/files/Next%20to%20You.mp3 | 95d620e1ad7bd7c73366979e384f172be21ebc5fe68bdc1af3908faf8a7c7b44 |
| 8bit-bossa.mp3 | "Bossa Nova" (8bit Bossa) by Joth | https://opengameart.org/content/bossa-nova | https://opengameart.org/sites/default/files/8bit%20Bossa.mp3 | 0ee835fd279ac5fa15f9346744cbafc2ba800c1c0671b78ca9abe2b4353402f7 |
| happy-lullaby.mp3 | "Happy Lullaby" by cynicmusic | https://opengameart.org/content/happy-lullaby-song17 | https://opengameart.org/sites/default/files/song17.mp3 | 9fa0b0e96860eace536fa36f4e9c2c1284db894a8df3cdaa19ddae429b1bfd42 |

## DeepFilterNet (microphone noise reduction)

The "Noise reduction" and "Podcast" microphone modes use the `deep-filter` command-line tool (DeepFilterNet3 model built in) from https://github.com/Rikorose/DeepFilterNet, dual-licensed MIT / Apache-2.0. It is not bundled: on first use the app downloads
https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-pc-windows-msvc.exe
(26,912,256 bytes, sha256 75e11fa16445f560cb6b021521ddb89e89270d13b83089705d98776f58fd7915) into `<userData>/models/deepfilternet/` and checks the hash before running it.
