import type { CenterConfig } from "../models/CenterConfig.js";

export const centers: readonly CenterConfig[] = Object.freeze([
  { 
    id: "ordibehesht-shiraz", 
    name: "بیمارستان اردیبهشت شیراز", 
    adminName: "جناب آقای مهدی سنگی",
    enabled: true, todoListName: "اردیبهشت شیراز", todoGroupName: "His Ticket" },
  {
    id: "barakat-emam-khomeini-mianeh",
    name: "بیمارستان برکت امام خمینی میانه",
    adminName: "مژگان حیدری",
    enabled: true,
    todoListName: "برکت امام میانه",
    todoGroupName: "His Ticket",
  },
  {
    id: "khatam-al-anbia-mianeh",
    name: "بیمارستان خاتم الانبیا میانه",
    adminName: "رعنا محرم زاده",
    enabled: true,
    todoListName: "خاتم میانه",
    todoGroupName: "His Ticket",
  },
  {
    id: "mehr-madar-torbat-jam",
    name: "بیمارستان مهر مادر تربت جام",
    adminName: "نسرین ابراهیمی",
    enabled: true,
    todoListName: "مهر مادر",
    todoGroupName: "His Ticket",
  },
]);
