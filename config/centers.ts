import type { CenterConfig } from "../models/CenterConfig.js";

export const centers: readonly CenterConfig[] = Object.freeze([
  { id: "ordibehesht-shiraz", name: "بیمارستان اردیبهشت شیراز", enabled: true },
  {
    id: "barakat-emam-khomeini-mianeh",
    name: "بیمارستان برکت امام خمینی میانه",
    enabled: true,
  },
  {
    id: "khatam-al-anbia-mianeh",
    name: "بیمارستان خاتم الانبیا میانه",
    enabled: true,
  },
  {
    id: "mehr-madar-torbat-jam",
    name: "بیمارستان مهر مادر تربت جام",
    enabled: true,
  },
]);
