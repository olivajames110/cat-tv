import { useCallback, useRef, useState } from "react";
import { DEFAULT_LOOK } from "../shared/look.js";

// While someone drags a slider, the server echoes back each value they sent;
// ignore server looks for this long after a local edit so the slider doesn't
// jump back to an older value mid-drag.
const ECHO_IGNORE_MS = 600;

// The look (scene, cursor, sizes) is shared through the server so the TV panel
// and the active phone stay in sync. Feed every `state` message to `onState`,
// and send the patch passed to `editLook` to the server as a `look` message.
export default function useSharedLook() {
  const [look, setLook] = useState(DEFAULT_LOOK);
  const lastEditRef = useRef(0);

  const editLook = useCallback((patch) => {
    lastEditRef.current = Date.now();
    setLook((l) => ({ ...l, ...patch }));
  }, []);

  const onState = useCallback((msg) => {
    if (msg.look && Date.now() - lastEditRef.current > ECHO_IGNORE_MS) {
      setLook(msg.look);
    }
  }, []);

  return { look, editLook, onState };
}
