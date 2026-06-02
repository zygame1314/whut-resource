const GUESTBOOK_API_URL = API_ENDPOINTS.guestbook;
const guestbookSection = document.getElementById('guestbook-section');
const guestbookList = document.getElementById('guestbook-list');
const guestbookForm = document.getElementById('guestbook-form');
const guestbookContentInput = document.getElementById('guestbook-content');
const submitGuestbookBtn = document.getElementById('submit-guestbook-btn');
const guestbookPagination = document.getElementById('guestbook-pagination');
let guestbookCursorStack = [];
let guestbookPageIndex = -1;
let currentGuestbookSort = 'time';
let currentGuestbookFilter = 'all';
let currentGuestbookStatus = 'all';
const GUESTBOOK_PER_PAGE = 5;
const MAX_CURSOR_STACK_PAGES = 10;
const REJECT_PRESETS = [
    '无关内容',
    '重复提交',
    '表述不清',
    '无法实现',
];
let isAiProcessing = false;
