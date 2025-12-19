import "./globals.css";

import {RoutePage} from "./page/RoutePage/RoutePage.tsx";

import gpxUrl from "./assets/Log20251101-055029.gpx?url";
import img01Url from "./assets/PXL_20251031_210440833.jpg"
import img02Url from "./assets/PXL_20251031_212809833.jpg"
import img03Url from "./assets/PXL_20251031_212842625.MP.jpg"
import img04Url from "./assets/PXL_20251031_212913970.jpg"
import img05Url from "./assets/PXL_20251031_212918249.jpg"
import img06Url from "./assets/PXL_20251031_213237947.jpg"
import img07Url from "./assets/PXL_20251031_213400596.jpg"
import img08Url from "./assets/PXL_20251031_213417677.jpg"
import img09Url from "./assets/PXL_20251031_214440116.jpg"
import img10Url from "./assets/PXL_20251031_214511982.jpg"
import img11Url from "./assets/PXL_20251031_220108629.jpg"
import img12Url from "./assets/PXL_20251031_220122897.jpg"
import img13Url from "./assets/PXL_20251031_220519034.jpg"
import img14Url from "./assets/PXL_20251031_221305774.MP.jpg"
import img15Url from "./assets/PXL_20251031_221843382.jpg"
import img16Url from "./assets/PXL_20251031_223422598.jpg"
import img17Url from "./assets/PXL_20251031_224513186.jpg"
import img18Url from "./assets/PXL_20251031_224728709.jpg"
import img19Url from "./assets/PXL_20251031_230826426.jpg"
import img20Url from "./assets/PXL_20251031_232558082.jpg"
import img21Url from "./assets/PXL_20251031_232836575.jpg"

function App() {
    return (
        <>
            <RoutePage
                gpxUrl={gpxUrl}
                photoUrls={[
                    img01Url,
                    img02Url,
                    img03Url,
                    img04Url,
                    img05Url,
                    img06Url,
                    img07Url,
                    img08Url,
                    img09Url,
                    img10Url,
                    img11Url,
                    img12Url,
                    img13Url,
                    img14Url,
                    img15Url,
                    img16Url,
                    img17Url,
                    img18Url,
                    img19Url,
                    img20Url,
                    img21Url,
                ]}
            />
        </>
    )
}

export default App
