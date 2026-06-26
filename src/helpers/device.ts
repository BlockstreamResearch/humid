export const isMobile = () => {
	return !!(
		navigator.userAgent.match(/Android/i) ||
		navigator.userAgent.match(/webOS/i) ||
		navigator.userAgent.match(/iPhone/i) ||
		navigator.userAgent.match(/iPad/i) ||
		navigator.userAgent.match(/iPod/i) ||
		navigator.userAgent.match(/BlackBerry/i) ||
		navigator.userAgent.match(/Windows Phone/i)
	);
};

export const isWebpSupported = () => {
	const elem = document.createElement("canvas");

	if (elem.getContext && elem.getContext("2d")) {
		// was able or not to get WebP representation
		return elem.toDataURL("image/webp").indexOf("data:image/webp") == 0;
	}

	// very old browser like IE 8, canvas not supported
	return false;
};
