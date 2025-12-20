import type {FC} from "react";
import {useEffect, useRef} from "react";
import * as L from "leaflet";
import "./RouteMap.css";

export type Pin = Pick<L.LatLngLiteral, "lat" | "lng"> & {
	id: string;
	url: string;
	caption: string;
	takenAt: string;
};

// EXIF DateTimeOriginal から「時刻のみ（HH:MM:SS）」を抽出
function extractTimeOfDay(s?: string): string | undefined {
	if (!s) {
		return undefined;
	}
	const m = s.match(/\b(\d{1,2}:\d{2}:\d{2})\b/);
	return m ? m[1] : undefined;
}

// ポップアップの中身のコンテンツを作成
function createPopupContent(pin: Pin, pinIndex: number, numPins: number) {
	// // 時刻の抽出
	// const timeText = extractTimeOfDay(pin.takenAt);
	// 時刻のみにせず日時を表示することにした
	const timeText = pin.takenAt;

	// ポップアップコンテンツを作成
	const popupContent = document.createElement("div");

	popupContent.innerHTML = `
		<div class="popup-header">
			<div></div>
			<div class="photo-counter">${pinIndex + 1}/${numPins}</div>
			<button type="button" aria-label="close" class="btn-close">×</button>
		</div>
		<div class="popup-body">
			<button class="photo-btn btn-prev">&lt;</button>
			<div class="photo-container">
				<a class="photo-link" href="${pin.url}" target="_blank" rel="noopener noreferrer">
					<img class="photo-img" alt="${pin.caption}" />
				</a>
			</div>
			<button class="photo-btn btn-next">&gt;</button>
		</div>
		${timeText ? `<div class="photo-time">${timeText}</div>` : ""}
	`;

	return popupContent;
}

// メインコンポーネント
type RouteMapProps = {
	points: L.LatLngLiteral[];
	pins: Pin[];
	activePinIndex: number | null;
	onClickPin?: (id: string) => void;
	onNavigatePin?: (dir: -1 | 1 | 0) => void;
};
export const RouteMap: FC<RouteMapProps> = (
	{
		points,
		pins,
		activePinIndex,
		onClickPin,
		onNavigatePin,
	}
) => {
	const divRef = useRef<HTMLDivElement>(null);	// マップを描画するdiv要素
	const mapRef = useRef<L.Map | null>(null);		// Leafletのマップインスタンスを保持
	const photoLayerRef = useRef<L.LayerGroup | null>(null);
	const routeLayerRef = useRef<L.Polyline | null>(null);
	const popupRef = useRef<L.Popup | null>(null);
	const markerMapRef = useRef<Record<string, L.Marker>>({});

	// マップの初期化
	useEffect(() => {
		if (!divRef.current || mapRef.current) {
			return;
		}

		const map = L.map(
			divRef.current,
			{
				zoomControl: true,
				attributionControl: true,
			}
		);

		// 地理院タイル（標準）
		L.tileLayer(
			"https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
			{
				attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>",
			}
		).addTo(map);

		// 地理院タイル（陰影起伏）
		L.tileLayer(
			"https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png",
			{
				attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>",
				opacity: 0.3,	// 透明度
			}
		).addTo(map);

		photoLayerRef.current = L.layerGroup().addTo(map);

		popupRef.current = L.popup({
			className: "photo-popup",
			closeButton: false,
			autoPan: false,
			keepInView: false,
		});

		mapRef.current = map;

		// クリーンアップ
		return () => {
			map.remove();
			mapRef.current = null;
		};
	}, []);

	// 軌跡（ポリライン）の描画
	useEffect(() => {
		const map = mapRef.current;
		if (!map) {
			return;
		}

		// 既存のルートを削除
		if (routeLayerRef.current) {
			routeLayerRef.current.remove();
			routeLayerRef.current = null;
		}
		if (!points || points.length === 0) {
			return;
		}

		// ポリラインを追加
		routeLayerRef.current = L.polyline(
			points,
			{
				color: "red",
				weight: 3,
				opacity: 0.8,
			}
		).addTo(map);

		// マップの表示範囲を調整
		map.fitBounds(routeLayerRef.current.getBounds().pad(0.2));
	}, [points]);

	// 写真ピンの描画
	useEffect(() => {
		const grp = photoLayerRef.current;
		if (!grp || !mapRef.current) {
			return;
		}

		grp.clearLayers();
		markerMapRef.current = {};

		pins.forEach((pin) => {
			const marker = L.marker([pin.lat, pin.lng]);
			marker.on("click", (ev) => {
				ev.originalEvent?.stopPropagation();	// 外側クリックハンドラに伝播させない
				onClickPin?.(pin.id);
			});
			marker.addTo(grp);
			markerMapRef.current[pin.id] = marker;
		});
	}, [pins, onClickPin]);

	// アクティブ写真のポップアップ表示
	useEffect(() => {
		const map = mapRef.current;
		const popup = popupRef.current;
		if (!map || !popup) {
			return;
		}

		// activePhotoIdxが無効の時
		if (activePinIndex === null || activePinIndex < 0 || pins.length <= activePinIndex) {
			// ポップアップが開いていれば閉じる
			if (map.hasLayer(popup)) {
				map.closePopup(popup);
			}
			return;
		}

		// アクティブな写真ピンを取得
		const activePin = pins[activePinIndex];
		const latLng: L.LatLngTuple = [activePin.lat, activePin.lng];

		// ポップアップコンテンツを作成
		const popupContent = createPopupContent(activePin, activePinIndex, pins.length);

		// ポップアップ表示
		popup
			.setLatLng(latLng)
			.setContent(popupContent)
			.openOn(map);

		// 画像の流し込み
		const img = popupContent.querySelector("img.photo-img") as HTMLImageElement;
		if (img) {
			img.src = activePin.url;
			img.addEventListener(
				"load",
				() => popup.update(),
				{ once: true },		// 一度だけ実行なので、removeEventListener が不要になる
			);
		}

		// イベントリスナーの設定
		const popupElement = popup.getElement();
		if (!popupElement) {
			return;
		}

		const closeBtn = popupElement.querySelector<HTMLButtonElement>(".btn-close");
		const prevBtn = popupElement.querySelector<HTMLButtonElement>(".btn-prev");
		const nextBtn = popupElement.querySelector<HTMLButtonElement>(".btn-next");

		const handleClose = (e: MouseEvent) => {
			e.stopPropagation();
			onNavigatePin?.(0);
		};
		const handlePrev = (e: MouseEvent) => {
			e.stopPropagation();
			onNavigatePin?.(-1);
		};
		const handleNext = (e: MouseEvent) => {
			e.stopPropagation();
			onNavigatePin?.(1);
		};
		const stopPropagation = (e: MouseEvent) => {
			e.stopPropagation();
		};

		closeBtn?.addEventListener("click", handleClose);
		prevBtn?.addEventListener("click", handlePrev);
		nextBtn?.addEventListener("click", handleNext);
		popupElement.addEventListener("click", stopPropagation);

		// クリーンアップ
		return () => {
			closeBtn?.removeEventListener("click", handleClose);
			prevBtn?.removeEventListener("click", handlePrev);
			nextBtn?.removeEventListener("click", handleNext);
			popupElement.removeEventListener("click", stopPropagation);
		};
	}, [activePinIndex, pins, onNavigatePin]);

	return (
		<div
			ref={divRef}
			style={{height: "calc(100vh - 20px)", width: "100%"}}
			role="application"
			aria-label="Route map with photo pins"
		/>
	);
};
