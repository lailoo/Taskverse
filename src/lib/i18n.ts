import { createContext, useContext } from "react";

export type AppLanguage = "zh" | "en" | "fr" | "ja" | "ko";

export const APP_LANGUAGE_KEY = "taskverse-language";

export const APP_LANGUAGES: ReadonlyArray<{ value: AppLanguage; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
];

export const isAppLanguage = (value: string | null): value is AppLanguage =>
  value === "zh" || value === "en" || value === "fr" || value === "ja" || value === "ko";

export const LOCALE_BY_LANGUAGE: Record<AppLanguage, string> = {
  zh: "zh-CN",
  en: "en-US",
  fr: "fr-FR",
  ja: "ja-JP",
  ko: "ko-KR",
};

export const UI_TEXT = {
  zh: { home: "好日子", myPlan: "我的婚礼", map: "筹备地图", board: "任务看板", city: "婚礼城市", budget: "婚礼预算", branch: "筹备分支", addBranch: "添加筹备分支", allTasks: "全部任务", mySpace: "我们的空间", ai: "婚礼 AI 助手", versions: "项目版本", import: "导入备份", export: "导出表格", settings: "项目设置", search: "搜索任务", owner: "所有人", undo: "撤销", redo: "重做", pendingDate: "婚期待定", progress: "筹备进度", mapIntro: "从一个想法，到我们的一天。", cityIntro: "每一项筹备，都会在城市里留下痕迹。", budgetIntro: "把心意留给重要的事。", language: "界面语言", chinese: "中文", english: "English", french: "Français", japanese: "日本語", korean: "한국어", privateSpace: "私人筹备空间", done: "已完成", doing: "进行中", waiting: "等回复", todo: "待办", unassigned: "未分配", dueUnset: "日期待定", noTasks: "暂无任务", noMatches: "没有符合条件的任务", task: "任务", tasks: "任务", priority: "优先级", ownerLabel: "负责人", status: "状态", notes: "备注", reference: "参考链接", addSubtask: "子任务", addSibling: "同级任务", save: "保存", cancel: "取消", confirm: "确认", close: "关闭", edit: "编辑", details: "任务详情", collapse: "收起", expand: "展开", building: "建筑", construction: "建设中", completed: "已竣工", residents: "位居民", cityMap: "小镇地图", locateOnMap: "在脑图中查看", fullTask: "完整任务", aiAssistant: "AI 助手", newSession: "新建会话", noChatHistory: "暂无聊天记录" },
  en: { home: "Good Days", myPlan: "My wedding", map: "Planning map", board: "Task board", city: "Wedding city", budget: "Wedding budget", branch: "Planning branches", addBranch: "Add planning branch", allTasks: "All tasks", mySpace: "Our space", ai: "Wedding AI assistant", versions: "Project versions", import: "Import backup", export: "Export table", settings: "Project settings", search: "Search tasks", owner: "Everyone", undo: "Undo", redo: "Redo", pendingDate: "Date to be set", progress: "Planning progress", mapIntro: "From one idea to our day.", cityIntro: "Every preparation leaves a mark on the city.", budgetIntro: "Save your care for what matters.", language: "Interface language", chinese: "中文", english: "English", french: "Français", japanese: "日本語", korean: "한국어", privateSpace: "Private planning space", done: "Done", doing: "In progress", waiting: "Waiting", todo: "To do", unassigned: "Unassigned", dueUnset: "Date to be set", noTasks: "No tasks yet", noMatches: "No matching tasks", task: "Task", tasks: "Tasks", priority: "Priority", ownerLabel: "Owner", status: "Status", notes: "Notes", reference: "Reference link", addSubtask: "Subtask", addSibling: "Sibling task", save: "Save", cancel: "Cancel", confirm: "Confirm", close: "Close", edit: "Edit", details: "Task details", collapse: "Collapse", expand: "Expand", building: "Building", construction: "Under construction", completed: "Completed", residents: "residents", cityMap: "Town map", locateOnMap: "View on map", fullTask: "Full task", aiAssistant: "AI assistant", newSession: "New conversation", noChatHistory: "No chat history yet" },
  fr: { home: "Bons jours", myPlan: "Mon mariage", map: "Carte de préparation", board: "Tableau des tâches", city: "Ville du mariage", budget: "Budget du mariage", branch: "Branches de préparation", addBranch: "Ajouter une branche", allTasks: "Toutes les tâches", mySpace: "Notre espace", ai: "Assistant IA du mariage", versions: "Versions du projet", import: "Importer une sauvegarde", export: "Exporter le tableau", settings: "Paramètres du projet", search: "Rechercher des tâches", owner: "Tout le monde", undo: "Annuler", redo: "Rétablir", pendingDate: "Date à définir", progress: "Avancement", mapIntro: "D'une idée à notre journée.", cityIntro: "Chaque préparation laisse une trace dans la ville.", budgetIntro: "Gardons notre énergie pour l'essentiel.", language: "Langue de l'interface", chinese: "中文", english: "English", french: "Français", japanese: "日本語", korean: "한국어", privateSpace: "Espace de préparation privé", done: "Terminé", doing: "En cours", waiting: "En attente", todo: "À faire", unassigned: "Non attribué", dueUnset: "Date à définir", noTasks: "Aucune tâche", noMatches: "Aucune tâche correspondante", task: "Tâche", tasks: "Tâches", priority: "Priorité", ownerLabel: "Responsable", status: "Statut", notes: "Notes", reference: "Lien de référence", addSubtask: "Sous-tâche", addSibling: "Tâche au même niveau", save: "Enregistrer", cancel: "Annuler", confirm: "Confirmer", close: "Fermer", edit: "Modifier", details: "Détails de la tâche", collapse: "Réduire", expand: "Développer", building: "Bâtiment", construction: "En construction", completed: "Terminé", residents: "habitants", cityMap: "Carte de la ville", locateOnMap: "Voir sur la carte mentale", fullTask: "Tâche complète", aiAssistant: "Assistant IA", newSession: "Nouvelle conversation", noChatHistory: "Aucun historique" },
  ja: { home: "いい日々", myPlan: "私たちの結婚式", map: "準備マップ", board: "タスクボード", city: "ウェディングシティ", budget: "結婚式の予算", branch: "準備ブランチ", addBranch: "ブランチを追加", allTasks: "すべてのタスク", mySpace: "私たちのスペース", ai: "ウェディング AI アシスタント", versions: "プロジェクトのバージョン", import: "バックアップを読み込む", export: "表をエクスポート", settings: "プロジェクト設定", search: "タスクを検索", owner: "全員", undo: "元に戻す", redo: "やり直す", pendingDate: "日付未定", progress: "準備の進捗", mapIntro: "ひとつのアイデアから、私たちの日へ。", cityIntro: "準備の一つひとつが街に残ります。", budgetIntro: "大切なことに心を使おう。", language: "表示言語", chinese: "中文", english: "English", french: "Français", japanese: "日本語", korean: "한국어", privateSpace: "プライベートな準備スペース", done: "完了", doing: "進行中", waiting: "返信待ち", todo: "未着手", unassigned: "未割り当て", dueUnset: "日付未定", noTasks: "タスクはありません", noMatches: "一致するタスクはありません", task: "タスク", tasks: "タスク", priority: "優先度", ownerLabel: "担当者", status: "ステータス", notes: "メモ", reference: "参考リンク", addSubtask: "子タスク", addSibling: "同じ階層のタスク", save: "保存", cancel: "キャンセル", confirm: "確認", close: "閉じる", edit: "編集", details: "タスク詳細", collapse: "折りたたむ", expand: "展開", building: "建物", construction: "建設中", completed: "完成", residents: "住民", cityMap: "街のマップ", locateOnMap: "マップで見る", fullTask: "タスク全体", aiAssistant: "AI アシスタント", newSession: "新しい会話", noChatHistory: "チャット履歴はありません" },
  ko: { home: "좋은 날들", myPlan: "우리 결혼식", map: "준비 지도", board: "작업 보드", city: "웨딩 시티", budget: "결혼식 예산", branch: "준비 분기", addBranch: "분기 추가", allTasks: "모든 작업", mySpace: "우리 공간", ai: "웨딩 AI 도우미", versions: "프로젝트 버전", import: "백업 가져오기", export: "표 내보내기", settings: "프로젝트 설정", search: "작업 검색", owner: "모두", undo: "실행 취소", redo: "다시 실행", pendingDate: "날짜 미정", progress: "준비 진행률", mapIntro: "하나의 아이디어에서 우리의 하루까지.", cityIntro: "모든 준비가 도시에 흔적을 남깁니다.", budgetIntro: "중요한 일에 마음을 남겨요.", language: "인터페이스 언어", chinese: "中文", english: "English", french: "Français", japanese: "日本語", korean: "한국어", privateSpace: "비공개 준비 공간", done: "완료", doing: "진행 중", waiting: "답변 대기", todo: "할 일", unassigned: "미지정", dueUnset: "날짜 미정", noTasks: "작업이 없습니다", noMatches: "일치하는 작업이 없습니다", task: "작업", tasks: "작업", priority: "우선순위", ownerLabel: "담당자", status: "상태", notes: "메모", reference: "참고 링크", addSubtask: "하위 작업", addSibling: "동급 작업", save: "저장", cancel: "취소", confirm: "확인", close: "닫기", edit: "편집", details: "작업 상세", collapse: "접기", expand: "펼치기", building: "건물", construction: "건설 중", completed: "완료", residents: "명의 주민", cityMap: "마을 지도", locateOnMap: "마인드맵에서 보기", fullTask: "전체 작업", aiAssistant: "AI 도우미", newSession: "새 대화", noChatHistory: "채팅 기록이 없습니다" },
} as const;

export type UIKey = keyof typeof UI_TEXT.zh;
export const statusText = (language: AppLanguage) => ({
  todo: UI_TEXT[language].todo,
  doing: UI_TEXT[language].doing,
  waiting: UI_TEXT[language].waiting,
  done: UI_TEXT[language].done,
});
export const priorityText = (language: AppLanguage) => ({
  none: language === "zh" ? "无优先级" : language === "fr" ? "Aucune" : language === "ja" ? "優先度なし" : language === "ko" ? "우선순위 없음" : "No priority",
  low: language === "zh" ? "低" : language === "fr" ? "Basse" : language === "ja" ? "低" : language === "ko" ? "낮음" : "Low",
  medium: language === "zh" ? "中" : language === "fr" ? "Moyenne" : language === "ja" ? "中" : language === "ko" ? "보통" : "Medium",
  high: language === "zh" ? "高" : language === "fr" ? "Haute" : language === "ja" ? "高" : language === "ko" ? "높음" : "High",
});

export const LanguageContext = createContext<AppLanguage>("zh");
export const useAppLanguage = () => useContext(LanguageContext);
