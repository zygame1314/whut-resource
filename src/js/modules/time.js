function parseServerTime(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
        var numDate = new Date(value);
        return isNaN(numDate.getTime()) ? null : numDate;
    }
    var raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{10}$/.test(raw)) return new Date(Number(raw) * 1000);
    if (/^\d{13}$/.test(raw)) return new Date(Number(raw));
    var iso = raw;
    if (iso.indexOf(' ') !== -1) {
        iso = iso.replace(' ', 'T');
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        iso += 'T00:00:00';
    }
    var hasZone = /[zZ]$/.test(iso) || /[+-]\d{2}:?\d{2}$/.test(iso);
    if (!hasZone) iso += 'Z';
    var date = new Date(iso);
    return isNaN(date.getTime()) ? null : date;
}

function formatServerDateTime(value, options) {
    var date = parseServerTime(value);
    if (!date) return '';
    var source = options || {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    };
    var opts = {};
    for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) opts[key] = source[key];
    }
    if (opts.hour12 === undefined) opts.hour12 = false;
    return date.toLocaleString('zh-CN', opts);
}

function formatServerDate(value, options) {
    var date = parseServerTime(value);
    if (!date) return '';
    var source = options || { year: 'numeric', month: '2-digit', day: '2-digit' };
    var opts = {};
    for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) opts[key] = source[key];
    }
    return date.toLocaleDateString('zh-CN', opts);
}

function formatServerRelativeTime(value, options) {
    var opts = options || {};
    var date = parseServerTime(value);
    if (!date) return opts.fallback || '';
    var gap = opts.now ? opts.now - date.getTime() : Date.now() - date.getTime();
    if (!(gap > 0)) return '刚刚';
    var seconds = Math.floor(gap / 1000);
    if (seconds < 60) return '刚刚';
    var space = opts.space === true ? ' ' : '';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + space + '分钟前';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + space + '小时前';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + space + '天前';
    if (opts.showMonthsYears) {
        var months = Math.floor(days / 30);
        if (months < 12) return months + space + '个月前';
        return Math.floor(days / 365) + space + '年前';
    }
    return opts.dateOnly ? formatServerDate(date) : formatServerDateTime(date);
}
