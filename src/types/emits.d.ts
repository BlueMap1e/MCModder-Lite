export interface AutoLinkOptionEmitPayload {
  click: [type: AutoLinkEntryType, id: string, textHalf: string, textFull: string];
}

/** 贴纸离开某个列表的原因 */
export type StickerRemovedReason = "deleted" | "unfavorited" | "unshared";

/** `AttitudeStickerPlaza` 的事件 */
export interface AttitudeStickerPlazaEmitPayload {
  /** 我共享的贴纸离开了广场（取消共享 / 删除）：父组件应刷新广场列表 */
  stickerRemoved: [sticker: SupabaseAttitudeSticker];
}
