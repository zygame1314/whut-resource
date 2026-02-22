function isAdmin(user) {
    return user && (user.role === 'admin' || user.role === 'super_admin');
}
function isSuperAdmin(user) {
    return user && user.role === 'super_admin';
}
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function formatDateLocal(dateString) {
    if (!dateString) return '';
    let date;
    if (typeof dateString === 'string' && !dateString.includes('Z') && !dateString.includes('+')) {
        date = new Date(dateString.replace(' ', 'T') + 'Z');
    } else {
        date = new Date(dateString);
    }
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
