import { useRef, useState } from "react";
import { FileCode, Upload, X } from "lucide-react";

export default function LoadModal({ onClose, onLoad }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const pick = (f) => {
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.(v|sv|vh)$/i, ""));
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files && e.dataTransfer.files[0]);
  };
  const ready = name.trim() && file;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Load a design</span>
          <button className="x" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <label className="field-lbl">chip name</label>
        <input
          className="field" value={name} autoFocus placeholder="e.g. my_fifo"
          onChange={(e) => setName(e.target.value)}
        />

        <label className="field-lbl">verilog source</label>
        <div
          className={`drop ${drag ? "drag" : ""} ${file ? "has" : ""}`}
          onClick={() => inputRef.current && inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef} type="file" accept=".v,.sv,.vh" hidden
            onChange={(e) => pick(e.target.files && e.target.files[0])}
          />
          {file ? (
            <div className="file-row">
              <FileCode size={16} />
              <span className="mono">{file.name}</span>
              <span className="file-sz mono">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
          ) : (
            <>
              <Upload size={18} />
              <span>drop a .v / .sv file, or <u>browse</u></span>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-em" disabled={!ready} onClick={() => onLoad(name.trim(), file)}>
            Load design
          </button>
        </div>
      </div>
    </div>
  );
}
