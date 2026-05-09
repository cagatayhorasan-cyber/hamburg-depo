"use strict";

/**
 * DRC MAN toplu FAQ yükleme manifesti.
 * Her satır scripts/ altındaki bir (veya iki parça) JSON dosyasının
 * assistant_troubleshooting_bank tablosuna context_id=<slug> altında
 * yazılmasını tarif eder. UI'den "Eğitimi Yükle" ile tetiklenir.
 *
 * Dosya yapısı tek-parça veya iki-parça olabilir:
 *   { file:  "drc_man_training_faq.json", slug: "training", defaultSummary: "..." }
 *   { files: ["drc_man_product_faq.part1.json", "drc_man_product_faq.part2.json"],
 *     slug: "product", defaultSummary: "..." }
 */

const DRC_MAN_FAQ_MANIFEST = [
  {
    files: ["drc_man_product_faq.part1.json", "drc_man_product_faq.part2.json"],
    slug: "product",
    defaultSummary: "DRC MAN urun egitimi",
  },
  { file: "drc_man_training_faq.json", slug: "training", defaultSummary: "DRC MAN temel egitim" },
  { file: "drc_man_troubleshooting_faq.json", slug: "troubleshooting", defaultSummary: "DRC MAN ariza bankasi" },
  { file: "drc_man_electrical_faq.json", slug: "electrical", defaultSummary: "DRC MAN elektrik bankasi" },
  { file: "drc_man_gases_faq.json", slug: "gases", defaultSummary: "DRC MAN gaz bankasi" },
  { file: "drc_man_master_components_faq.json", slug: "master_components", defaultSummary: "DRC MAN master bilesenleri" },
  { file: "drc_man_master_field_faq.json", slug: "master_field", defaultSummary: "DRC MAN master saha" },
  { file: "drc_man_pt_superheat_faq.json", slug: "pt_superheat", defaultSummary: "DRC MAN PT / superheat" },
  { file: "drc_man_refrigeration_faq.json", slug: "refrigeration", defaultSummary: "DRC MAN sogutma teorisi" },
  { file: "drc_man_sales_instinct_faq.json", slug: "sales_instinct", defaultSummary: "DRC MAN satis refleksi" },
  { file: "drc_man_malzeme_vs_ustalik_faq.json", slug: "malzeme_vs_ustalik", defaultSummary: "DRC MAN malzeme/ustalık ayrımı" },
  { file: "drc_man_stock_technical_faq.json", slug: "stock_technical", defaultSummary: "DRC MAN stoklu ürün teknik veri bankası" },
  {
    files: ["drc_man_all_products_faq.part1.json", "drc_man_all_products_faq.part2.json"],
    slug: "all_products",
    defaultSummary: "DRC MAN tüm aktif ürün katalog teknik bankası",
  },
  {
    file: "drc_man_coldroom_design_50k_faq.json",
    slug: "coldroom_design_50k",
    defaultSummary: "DRC MAN 50K soguk oda design + ekipman secimi + montaj bilgi bankasi",
  },
  {
    file: "drc_man_coldroom_qa_20k_faq.json",
    slug: "coldroom_qa_20k",
    defaultSummary: "DRC MAN 20K soguk oda canli soru-cevap (ColdRoomPro opsiyonlari)",
  },
];

module.exports = { DRC_MAN_FAQ_MANIFEST };
