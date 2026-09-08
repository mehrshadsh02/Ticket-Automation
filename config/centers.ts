import type { CenterConfig } from "../models/CenterConfig.js";

export const centers: readonly CenterConfig[] = Object.freeze([
  { 
    id: "ordibehesht-shiraz", 
    name: "بیمارستان اردیبهشت شیراز", 
    enabled: true, todoListName: "اردیبهشت شیراز", todoGroupName: "His Ticket" },
  {
    id: "barakat-emam-khomeini-mianeh",
    name: "بیمارستان برکت امام خمینی میانه",
    enabled: true,
    todoListName: "برکت امام میانه",
    todoGroupName: "His Ticket",
  },
  {
    id: "khatam-al-anbia-mianeh",
    name: "بیمارستان خاتم الانبیا میانه",
    enabled: true,
    todoListName: "خاتم میانه",
    todoGroupName: "His Ticket",
  },
  {
    id: "mehr-madar-torbat-jam",
    name: "بیمارستان مهر مادر تربت جام",
    enabled: true,
    todoListName: "مهر مادر",
    todoGroupName: "His Ticket",
  },
]);
