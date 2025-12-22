// ========================================
// Firebase設定
// ========================================
// 以下の値をFirebaseコンソールから取得した値に置き換えてください
// Firebaseコンソール → プロジェクト設定 → マイアプリ → SDK の設定と構成

const firebaseConfig = {
    apiKey: "AIzaSyB5ZYgY6Vcx2_3VZhWjkZnqY_dwt04I61w",
    authDomain: "my-task-manager-20201.firebaseapp.com",
    projectId: "my-task-manager-20201",
    storageBucket: "my-task-manager-20201.firebasestorage.app",
    messagingSenderId: "826593583270",
    appId: "1:826593583270:web:2a0385c73e1fa834261467"
};

// ========================================
// 設定が完了しているかチェック
// ========================================
function isFirebaseConfigured() {
    return firebaseConfig.apiKey !== "YOUR_API_KEY" && 
           firebaseConfig.projectId !== "YOUR_PROJECT_ID";
}
