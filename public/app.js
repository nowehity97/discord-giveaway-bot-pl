// public/app.js
const { useState, useEffect, createElement: e } = React;
const { createRoot } = ReactDOM;

// Główny komponent aplikacji.
const App = () => {
    const [giveaways, setGiveaways] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Wartość guildId, którą podałeś, używana do tworzenia linków.
    const guildId = '888827274005184572';

    // Efekt do pobierania danych o konkursach z API.
    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch('/api/giveaways'); // Wskazuje na lokalne API
                if (!response.ok) {
                    throw new Error(`Błąd serwera: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                setGiveaways(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Funkcja pomocnicza do formatowania daty zakończenia konkursu.
    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const calculateTimeLeft = (endTime) => {
        const total = endTime - Date.now();
        if (total <= 0) return "Zakończono!";
    
        const days = Math.floor(total / (1000 * 60 * 60 * 24));
        const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((total % (1000 * 60)) / 1000);
    
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (parts.length < 3 && seconds > 0) parts.push(`${seconds}s`);
    
        return parts.join(' ');
    };

    // Filtrowanie konkursów na aktywne i zakończone.
    const activeGiveaways = giveaways.filter(g => !g.ended);
    const endedGiveaways = giveaways.filter(g => g.ended);

    // Stan ładowania
    if (loading) {
        return e('div', { className: "flex items-center justify-center min-h-screen bg-gray-900 text-white" },
            e('div', { className: "text-xl font-bold" }, 'Ładowanie danych...')
        );
    }

    // Stan błędu
    if (error) {
        return e('div', { className: "flex items-center justify-center min-h-screen bg-gray-900 text-red-400" },
            e('div', { className: "text-xl font-bold" }, `Błąd: ${error}`)
        );
    }

    // Główne renderowanie aplikacji.
    return e('div', { className: "bg-gray-900 min-h-screen text-gray-200 p-4 md:p-8 font-sans" },
        e('header', { className: "mb-8 text-center" },
            e('h1', { className: "text-4xl md:text-6xl font-extrabold text-blue-400" }, 'Wiedźmin Polska Giveaway'),
            e('p', { className: "mt-2 text-lg md:text-xl text-gray-400" }, 'Informacje o aktualnych i zakończonych konkursach.')
        ),

        // Sekcja Aktywne Konkursy
        e('section', { className: "mb-12" },
            e('h2', { className: "text-3xl md:text-4xl font-bold text-green-400 mb-6 border-b-2 border-green-500 pb-2" }, '🎉 Aktywne Konkursy'),
            e('div', { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" },
                activeGiveaways.length > 0 ? (
                    activeGiveaways.map((giveaway) => (
                        e('div', { key: giveaway.id, className: "bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300" },
                            e('h3', { className: "text-2xl font-bold text-green-300 mb-2" }, giveaway.prize),
                            e('p', { className: "text-gray-400 mb-4" }, giveaway.description || 'Brak opisu.'),
                            e('div', { className: "space-y-2 text-sm" },
                                e('p', null, e('span', { className: "font-semibold text-gray-300" }, 'Zakończenie: '), ` ${formatDate(giveaway.endTime)}`),
                                e('p', null, e('span', { className: "font-semibold text-gray-300" }, 'Pozostało: '), ` ${calculateTimeLeft(giveaway.endTime)}`),
                                e('p', null, e('span', { className: "font-semibold text-gray-300" }, 'Zwycięzcy: '), ` ${giveaway.winnersCount}`),
                                e('p', null, e('span', { className: "font-semibold text-gray-300" }, 'Uczestnicy: '), ` ${giveaway.participantsCount}`),
                                e('p', null, e('span', { className: "font-semibold text-gray-300" }, 'Organizator: '), ` ${giveaway.hostName}`)
                            ),
                            e('a', {
                                href: `https://discord.com/channels/${guildId}/${giveaway.channelId}/${giveaway.messageId}`,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                className: "mt-4 inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full transition-colors duration-300"
                            }, 'Przejdź do konkursu')
                        )
                    ))
                ) : (
                    e('p', { className: "text-gray-400 text-lg col-span-full" }, 'Brak aktywnych konkursów.')
                )
            )
        ),

        // Sekcja Zakończone Konkursy
        e('section', null,
            e('h2', { className: "text-3xl md:text-4xl font-bold text-yellow-400 mb-6 border-b-2 border-yellow-500 pb-2" }, '🏆 Zakończone Konkursy'),
            e('div', { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" },
                endedGiveaways.length > 0 ? (
                    endedGiveaways.map((giveaway) => (
                        e('div', { key: giveaway.id, className: "bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300 opacity-75" },
                            e('h3', { className: "text-2xl font-bold text-yellow-300 mb-2" }, giveaway.prize),
                            e('p', { className: "text-gray-400 mb-4" }, giveaway.description || 'Brak opisu.'),
                            e('div', { className: "space-y-2 text-sm" },
                                e('p', null, e('span', { className: "font-semibold text-gray-300" }, 'Zakończono: '), ` ${formatDate(giveaway.endTime)}`),
                                e('p', null, e('span', { className: "font-semibold text-gray-300" }, 'Zwycięzcy: '), ` ${giveaway.winnersCount}`),
                                e('p', null, e('span', { className: "font-semibold text-gray-300" }, 'Uczestnicy: '), ` ${giveaway.participantsCount}`),
                                e('p', null, e('span', { className: "font-semibold text-gray-300" }, 'Organizator: '), ` ${giveaway.hostName}`)
                            ),
                            e('a', {
                                href: `https://discord.com/channels/${guildId}/${giveaway.channelId}/${giveaway.messageId}`,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                className: "mt-4 inline-block bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-full transition-colors duration-300"
                            }, 'Zobacz konkurs')
                        )
                    ))
                ) : (
                    e('p', { className: "text-gray-400 text-lg col-span-full" }, 'Brak zakończonych konkursów.')
                )
            )
        )
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(e(App));
}
