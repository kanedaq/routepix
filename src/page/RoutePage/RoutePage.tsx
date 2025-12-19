import { type FC, useCallback, useMemo, useState, useEffect } from "react";
import GpxParser from "gpxparser";
import * as L from "leaflet";
import exifr from "exifr";
import {type Pin, RouteMap} from "../../components/RouteMap/RouteMap.tsx";

// GPXデータから緯度・経度の配列を取り出す
function parseGpx(gpxContent: string): L.LatLngLiteral[] {
	try {
		const gpx = new GpxParser();
		gpx.parse(gpxContent);

		if (!gpx.tracks?.[0]?.points?.length) {
			throw new Error("No track points found in GPX file");
		}

		return gpx.tracks[0].points.map(({ lat, lon }): L.LatLngLiteral => ({
			lat,
			lng: lon,
		}));
	} catch (error) {
		console.error("GPX parsing failed:", error);
		throw error;
	}
}

// 日付を整形する
function formatDateTimeOriginal(dto: Date | string | undefined): string | undefined {
	if (!dto) return undefined;

	if (dto instanceof Date) {
		// "YYYY-MM-DD HH:MM:SS" 形式に整形
		const pad = (n: number) => String(n).padStart(2, "0");
		const y = dto.getFullYear();
		const m = pad(dto.getMonth() + 1);
		const d = pad(dto.getDate());
		const H = pad(dto.getHours());
		const M = pad(dto.getMinutes());
		const S = pad(dto.getSeconds());
		return `${y}-${m}-${d} ${H}:${M}:${S}`;
	}

	return typeof dto === "string" ? dto : undefined;
}

// EXIF抽出関数
async function extractTrekExifFromFile(
	file: Blob
): Promise<{ lat?: number; lng?: number; takenAt?: string } | null> {
	type ExifGps = {
		latitude: number;
		longitude: number;
	};
	type ExifTags = {
		DateTimeOriginal?: Date | string;
	};

	try {
		const [gps, tags] = await Promise.all([
			exifr.gps(file),
			exifr.parse(file, { pick: ["DateTimeOriginal"] }),
		]);

		const lat = (gps as ExifGps)?.latitude;
		const lng = (gps as ExifGps)?.longitude;
		const takenAt = formatDateTimeOriginal((tags as ExifTags)?.DateTimeOriginal);

		// 何も取れなければ null
		if (lat == null && lng == null && !takenAt) {
			return null;
		}
		return { lat, lng, takenAt };
	} catch (e) {
		console.error("EXIF extraction failed:", e);
		return null;
	}
}

// 写真ソート関数
function sortPhotosByTime(photos: Pin[]): Pin[] {
	return [...photos].sort((a, b) => {
		// takenAtがない場合は末尾に配置する
		if (!a.takenAt && !b.takenAt) return 0;
		if (!a.takenAt) return 1;
		if (!b.takenAt) return -1;

		// "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS" に変換してパース
		const timeA = Date.parse(a.takenAt.replace(" ", "T"));
		const timeB = Date.parse(b.takenAt.replace(" ", "T"));

		// isNaNチェック
		if (isNaN(timeA) && isNaN(timeB)) return 0;
		if (isNaN(timeA)) return 1;
		if (isNaN(timeB)) return -1;

		return timeA - timeB;
	});
}

function useRouteData(gpxUrl: string, photoUrls: string[]) {
	const [routePoints, setRoutePoints] = useState<L.LatLngLiteral[]>([]);
	const [photos, setPhotos] = useState<Pin[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// 初期データの自動ロード（GPX + 画像）
	useEffect(() => {
		let isCancelled = false;

		const loadData = async () => {
			try {
				setLoading(true);
				setError(null);

				// GPX読み込み
				const gpxResponse = await fetch(gpxUrl);
				if (!gpxResponse.ok) {
					throw new Error(`Failed to fetch GPX: ${gpxResponse.statusText}`);
				}
				const gpxText = await gpxResponse.text();
				const points = parseGpx(gpxText);

				if (isCancelled) {
					return;
				}
				setRoutePoints(points);

				// 画像群のEXIF抽出
				const allResults = await Promise.all(
					photoUrls.map(async (url, i) => {
						try {
							const response = await fetch(url);
							if (!response.ok) {
								console.warn(`Failed to fetch photo: ${url}`);
								return null;
							}

							const blob = await response.blob();
							const exif = await extractTrekExifFromFile(blob);

							if (!exif || exif.lat == null || exif.lng == null) {
								// ★ GPS情報がない写真はピンとして扱わない
								return null;
							}

							const filename = url.split("/").pop() || "img";

							return {
								id: `${filename}-${i}`,
								url,
								caption: filename,
								// exif.latとexif.lngは non-null であることが保証される
								lat: exif.lat!,
								lng: exif.lng!,
								takenAt: exif.takenAt || "",
							} as Pin;
						} catch (e) {
							console.error(`Error processing photo ${url}:`, e);
							return null;
						}
					})
				);

				// TrekPhotoの型定義と合わせるため、nullを除外する
				const results = allResults.filter((photo): photo is Exclude<typeof photo, null> => photo !== null);
				setPhotos(results);
			} catch (e) {
				console.error("初期データの読み込みに失敗しました:", e);
				if (!isCancelled) {
					setError(e instanceof Error ? e.message : "Unknown error occurred");
				}
			} finally {
				if (!isCancelled) {
					setLoading(false);
				}
			}
		};

		loadData();

		return () => {
			isCancelled = true;
		};
	}, [gpxUrl, photoUrls]);

	return { routePoints, photos, loading, error };
}

// メインコンポーネント
type RoutePageProps = {
	gpxUrl: string;       // GPX ファイル 1つ分の URL
	photoUrls: string[];  // 画像ファイル複数分の URL
};
export const RoutePage: FC<RoutePageProps> = ({ gpxUrl, photoUrls }) => {
	const { routePoints, photos, loading, error } = useRouteData(gpxUrl, photoUrls);
	const [activePinIndex, setActivePinIndex] = useState<number | null>(null); // ポップアップの対象 index（写真ピン順）

	// ピン配列（順序は撮影時刻があれば時刻順、なければ追加順）
	const pins = useMemo(() => {
		const withGPS = photos.filter((p) => p.lat != null && p.lng != null);
		return sortPhotosByTime(withGPS);
	}, [photos]);

	// ピンクリックハンドラー
	const handleOpenPopup = useCallback(
		(id: string) => {
			const idx = pins.findIndex((p) => p.id === id);
			if (0 <= idx) {
				setActivePinIndex(idx);
			}
		},
		[pins]
	);

	// ポップアップのナビゲーション: dir=-1/1、0 は close
	const handleNavigatePopup = useCallback(
		(dir: -1 | 0 | 1) => {
			if (dir === 0) {
				setActivePinIndex(null);
				return;
			}

			const n = pins.length;
			if (activePinIndex == null || n === 0) {
				return;
			}

			const next = (activePinIndex + dir + n) % n;
			setActivePinIndex(next);
		},
		[activePinIndex, pins.length]
	);

	// キーボードナビゲーション
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (activePinIndex === null) return;

			switch (e.key) {
				case "ArrowLeft":
					e.preventDefault();
					handleNavigatePopup(-1);
					break;
				case "ArrowRight":
					e.preventDefault();
					handleNavigatePopup(1);
					break;
				case "Escape":
					e.preventDefault();
					handleNavigatePopup(0);
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [activePinIndex, handleNavigatePopup]);

	// ローディング・エラー表示
	if (loading) {
		return (
			<div style={{
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				height: "100vh"
			}}>
				<div>Loading route and photos...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div style={{
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				height: "100vh",
				color: "red"
			}}>
				<div>Error: {error}</div>
			</div>
		);
	}

	return (
		<div>
			<RouteMap
				points={routePoints}
				pins={pins}
				activePinIndex={activePinIndex}
				onClickPin={handleOpenPopup}
				onNavigatePin={handleNavigatePopup}
			/>
		</div>
	);
};
