// Draws settings beside the sidebar (#21, ADR 0008).
//
// The sidebar runs drawBesideFrames in the web page behind it with
// scripting.executeScript, so the browser copies the function's text and
// nothing outside it is in reach. It only adds, moves or removes Glacier's own
// frames, each one an extension page (beside.html); it never reads, stores or
// sends anything from the page.
//
// `state`:
//   origin      the extension's origin, so only its frames can say "gone"
//   settings    the settings frame's address, or null for none
//   sidebarX    in Firefox, where the sidebar starts on screen, so
//               settings go on the side of the page next to it
export function drawBesideFrames(state) {
  const SETTINGS_WIDTH = 360;

  const remove = () => {
    if (window.glacierBeside) window.glacierBeside.host.remove();
    window.glacierBeside = null;
  };

  // A frame whose sidebar has closed asks to be taken away.
  if (!window.glacierBesideListening) {
    window.glacierBesideListening = true;
    window.addEventListener("message", (event) => {
      if (event.origin === window.glacierBesideOrigin && event.data === "glacier-beside-gone") remove();
    });
  }
  window.glacierBesideOrigin = state.origin;

  if (!state.settings) {
    remove();
    return true;
  }

  let drawn = window.glacierBeside;
  if (!drawn || !drawn.host.isConnected) {
    const host = document.createElement("glacier-panels");
    host.style.cssText = "all: initial; display: block; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    document.documentElement.append(host);
    drawn = window.glacierBeside = { host, root, frames: {} };
  }

  // Firefox can put its sidebar on the left; Chrome's position can't be read.
  const onLeft = typeof window.mozInnerScreenX === "number" && typeof state.sidebarX === "number" && state.sidebarX < window.mozInnerScreenX;
  const edge = onLeft ? "left" : "right";

  const place = (name, src, box) => {
    let frame = drawn.frames[name];
    if (!src) {
      if (frame) frame.remove();
      delete drawn.frames[name];
      return;
    }
    if (!frame) {
      frame = drawn.frames[name] = document.createElement("iframe");
      frame.title = "Glacier settings";
      drawn.root.append(frame);
    }
    if (frame.getAttribute("src") !== src) frame.setAttribute("src", src);
    frame.style.cssText = [
      "position: fixed",
      "border: 0",
      "margin: 0",
      "padding: 0",
      "background: transparent",
      "color-scheme: normal",
      `${edge}: ${box.offset}px`,
      `top: ${box.top}px`,
      `width: ${box.width}px`,
      box.height ? `height: ${box.height}px` : "height: 100vh",
      box.shadow ? "box-shadow: 0 0 18px rgba(0, 0, 0, 0.25)" : "",
    ].join("; ");
  };

  place("settings", state.settings, { offset: 0, top: 0, width: SETTINGS_WIDTH, shadow: true });
  return true;
}
