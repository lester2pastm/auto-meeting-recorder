const FALLBACK_MEETING_TITLE = '未命名会议';
const DEFAULT_TITLE_MAX_LENGTH = 15;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/;
const WRAPPING_QUOTES_PATTERN = /^["'“”‘’「」『』《》]+|["'“”‘’「」『』《》]+$/g;

function padDatePart(value) {
    return String(value).padStart(2, '0');
}

function isValidDateParts(year, month, day, hours, minutes) {
    const parsedDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

    return parsedDate.getUTCFullYear() === year
        && parsedDate.getUTCMonth() === month - 1
        && parsedDate.getUTCDate() === day
        && parsedDate.getUTCHours() === hours
        && parsedDate.getUTCMinutes() === minutes;
}

function formatDateParts(year, month, day, hours, minutes) {
    return `${year}-${padDatePart(month)}-${padDatePart(day)} ${padDatePart(hours)}:${padDatePart(minutes)}`;
}

function extractMeetingDateFromString(dateString) {
    if (typeof dateString !== 'string') {
        return '';
    }

    const trimmedDateString = dateString.trim();
    const match = trimmedDateString.match(ISO_DATE_PREFIX_PATTERN);

    if (!match) {
        return '';
    }

    const [, yearText, monthText, dayText, hoursText, minutesText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (!isValidDateParts(year, month, day, hours, minutes)) {
        return '';
    }

    return formatDateParts(year, month, day, hours, minutes);
}

function formatMeetingDate(dateInput) {
    const literalDate = extractMeetingDateFromString(dateInput);

    if (literalDate) {
        return literalDate;
    }

    const parsedDate = dateInput instanceof Date ? dateInput : new Date(dateInput);

    if (Number.isNaN(parsedDate.getTime())) {
        return '';
    }

    return formatDateParts(
        parsedDate.getFullYear(),
        parsedDate.getMonth() + 1,
        parsedDate.getDate(),
        parsedDate.getHours(),
        parsedDate.getMinutes()
    );
}

function buildFallbackMeetingTitle(dateInput) {
    const formattedDate = formatMeetingDate(dateInput);
    return formattedDate ? `${FALLBACK_MEETING_TITLE} ${formattedDate}` : FALLBACK_MEETING_TITLE;
}

function truncateMeetingTitle(title, maxChars = DEFAULT_TITLE_MAX_LENGTH) {
    if (typeof title !== 'string') {
        return '';
    }

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
        return '';
    }

    return trimmedTitle.length > maxChars
        ? `${trimmedTitle.slice(0, maxChars)}...`
        : trimmedTitle;
}

function stripMarkdownTitlePrefix(title) {
    return title
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+•]\s+/, '')
        .replace(/^\d+[.)、]\s+/, '');
}

function sanitizeGeneratedMeetingTitle(title) {
    const normalizedTitle = String(title || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return stripMarkdownTitlePrefix(normalizedTitle)
        .replace(WRAPPING_QUOTES_PATTERN, '')
        .trim();
}

function getMeetingDisplayTitle(meeting) {
    if (meeting && typeof meeting.title === 'string') {
        const trimmedTitle = meeting.title.trim();

        if (trimmedTitle) {
            return trimmedTitle;
        }
    }

    return buildFallbackMeetingTitle(meeting && meeting.date);
}

const meetingTitleUtils = {
    buildFallbackMeetingTitle,
    truncateMeetingTitle,
    sanitizeGeneratedMeetingTitle,
    getMeetingDisplayTitle
};

if (typeof globalThis !== 'undefined') {
    globalThis.meetingTitleUtils = meetingTitleUtils;
    globalThis.buildFallbackMeetingTitle = buildFallbackMeetingTitle;
    globalThis.truncateMeetingTitle = truncateMeetingTitle;
    globalThis.sanitizeGeneratedMeetingTitle = sanitizeGeneratedMeetingTitle;
    globalThis.getMeetingDisplayTitle = getMeetingDisplayTitle;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = meetingTitleUtils;
}
