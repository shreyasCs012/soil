import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const CROPS = [
  "Arhar (Pigeon Pea)",
  "Bajra (Pearl Millet)",
  "Banana",
  "Barley",
  "Bengal Gram (Chickpea)",
  "Black Gram (Urad)",
  "Brinjal (Eggplant)",
  "Cardamom",
  "Cashew",
  "Coconut",
  "Coffee",
  "Cotton",
  "Cucumber",
  "Garlic",
  "Ginger",
  "Gram",
  "Green Gram (Moong)",
  "Groundnut",
  "Horse Gram",
  "Jowar (Sorghum)",
  "Jute",
  "Lentil (Masoor)",
  "Maize",
  "Mango",
  "Mustard",
  "Onion",
  "Paddy (Rice)",
  "Papaya",
  "Potato",
  "Ragi (Finger Millet)",
  "Rubber",
  "Sesame",
  "Soybean",
  "Sugarcane",
  "Sunflower",
  "Tea",
  "Tobacco",
  "Tomato",
  "Turmeric",
  "Wheat",
];

interface CropComboboxProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
}

export function CropCombobox({ value, onChange, id, required }: CropComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? CROPS.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : CROPS;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!CROPS.includes(query)) setQuery(value);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [query, value]);

  function select(crop: string) {
    onChange(crop);
    setQuery(crop);
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    inputRef.current?.focus();
    setOpen(true);
  }

  return (
    <div ref={containerRef} className="crop-combo-wrap">
      <div className="auth-input-wrap">
        <Search className="auth-input-icon" />
        <input
          ref={inputRef}
          id={id}
          className="auth-input"
          type="text"
          placeholder="Search crop…"
          value={query}
          required={required}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {query ? (
          <button type="button" className="auth-input-toggle" onClick={clear} aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown className="auth-input-icon" style={{ right: 12, left: "auto" }} />
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul className="crop-combo-list" role="listbox">
          {filtered.map((crop) => (
            <li
              key={crop}
              role="option"
              aria-selected={crop === value}
              className={`crop-combo-item${crop === value ? " crop-combo-item-active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); select(crop); }}
            >
              {crop}
            </li>
          ))}
        </ul>
      )}

      {open && filtered.length === 0 && (
        <div className="crop-combo-empty">No matching crop found</div>
      )}
    </div>
  );
}
