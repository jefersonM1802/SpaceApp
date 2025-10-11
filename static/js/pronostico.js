document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DEL DOM ---
    const map = L.map('map').setView([-9.9, -76.2], 5);
    const dateInput = document.getElementById('manual-date');
    const timeInput = document.getElementById('manual-time');
    const getManualBtn = document.getElementById('get-manual-btn');
    const resultsDiv = document.getElementById('results');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const agendaModal = document.getElementById('agenda-modal');

    let dailyChart = null; 
    let marker = null;
    let selectedLat = -9.9;
    let selectedLon = -76.2;

    // --- INICIALIZACIÓN DE MAPA ---
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // --- FUNCIONES DEL MODAL ---
    function openAgendaModal(lugar, fecha, hora) {
        document.getElementById('evento-lugar').value = lugar;
        document.getElementById('evento-fecha').value = `${fecha} ${hora}`;
        document.getElementById('evento-desc').value = '';
        agendaModal.style.display = 'flex';
    }

    function closeAgendaModal() {
        agendaModal.style.display = 'none';
    }

    async function saveAgendaEvent() {
        const lugar = document.getElementById('evento-lugar').value;
        const [fecha, hora] = document.getElementById('evento-fecha').value.split(' ');
        const descripcion = document.getElementById('evento-desc').value;

        const saveBtn = document.getElementById('save-agenda-btn');
        saveBtn.textContent = "Saving...";
        saveBtn.disabled = true;

        try {
            const response = await fetch('/api/agendar_evento', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titulo: lugar, descripcion, fecha, hora })
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    alert('You must be logged in to schedule an event.');
                    window.location.href = '/login';
                } else {
                    throw new Error(data.error || 'Error saving event.');
                }
            } else {
                alert('¡Event scheduled successfully!');
                closeAgendaModal();
            }

        } catch (error) {
            console.error("Error saving event.", error);
            alert(error.message);
        } finally {
            saveBtn.textContent = "Save event";
            saveBtn.disabled = false;
        }
    }

    function renderDailyChart(chartData) {
        if (dailyChart) { dailyChart.destroy(); }
        const canvas = document.getElementById('daily-chart-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        dailyChart = new Chart(ctx, {
            type: 'bar', 
            data: {
                labels: chartData.labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Temperature (°C)',
                        data: chartData.temperatures,
                        borderColor: '#e74c3c',
                        yAxisID: 'y_temp_hum',
                        tension: 0.4
                    },
                    {
                        type: 'line',
                        label: 'Dew point (°C)',
                        data: chartData.humidities,
                        borderColor: '#70c6ffff',
                        yAxisID: 'y_temp_hum',
                        tension: 0.4
                    },
                    {
                        type: 'bar',
                        label: 'Precipitation (mm)',
                        data: chartData.precipitations,
                        backgroundColor: 'rgba(0, 255, 106, 0.5)',
                        yAxisID: 'y_precip',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Full-Day Weather Forecast' },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { title: { display: true, text: 'Time of day'} },
                    y_temp_hum: { type: 'linear', position: 'left', title: { display: true, text: '°C'} },
                    y_precip: { type: 'linear', position: 'right', title: { display: true, text: 'mm'}, grid: { drawOnChartArea: false }, beginAtZero: true }
                }
            }
        });
    }

    async function fetchData(lat, lon, date, time) {
        resultsDiv.innerHTML = `<p class="loading">Consulting Data...</p>`;
        resultsDiv.style.display = 'block';
        try {
            const mainResponse = await fetch('/api/get_climate_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: lat, longitude: lon, date, time }),
            });
            if (!mainResponse.ok) throw new Error('Could not fetch description data.');
            const mainData = await mainResponse.json();
            
            let agendarBtnHTML = '';
            const hoy = new Date();
            hoy.setHours(0,0,0,0);
            const fechaConsultada = new Date(date + 'T00:00:00');

            if (fechaConsultada >= hoy) {
                agendarBtnHTML = `
                    <div class="agenda-btn-container">
                        <button id="agendar-btn">Schedule Visit</button>
                    </div>
                `;
            }
            
            async function traducirDescripcion(texto) {
  const respuesta = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=es|en`);
  const data = await respuesta.json();
  return data.responseData.translatedText;
}

if (marker) map.removeLayer(marker);
map.setView([lat, lon], 12);
marker = L.marker([lat, lon])
  .addTo(map)
  .bindPopup(`<b>${mainData.departamento || 'Location'}</b>`)
  .openPopup();

// 🔸 Primero renderiza todo igual que antes (sin traducir aún)
resultsDiv.innerHTML = `
  <h3>Results for ${mainData.departamento || 'the selected location.'}</h3>
  <p class="result-description">Translating...</p>
  <div class="chart-container"><canvas id="daily-chart-canvas"></canvas></div>
  ${agendarBtnHTML}
`;

// 🔸 Luego traduce y reemplaza solo el texto, sin destruir el botón
traducirDescripcion(mainData.descripcion).then(descripcionTraducida => {
  const descElem = resultsDiv.querySelector('.result-description');
  descElem.innerHTML = descripcionTraducida.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
});


            if (fechaConsultada >= hoy) {
                document.getElementById('agendar-btn').addEventListener('click', () => {
                    openAgendaModal(mainData.departamento || 'Selected location', date, time);
                });
            }

            const chartResponse = await fetch('/api/daily_chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: lat, longitude: lon, date }),
            });
            if (!chartResponse.ok) throw new Error('The data could not be obtained for the chart.');
            const chartData = await chartResponse.json();
            renderDailyChart(chartData);

        } catch (error) {
            console.error("Error in fetchData:", error);
            resultsDiv.innerHTML = `<p class="error-message">Error al conectar con el servidor.</p>`;
        }
    }

    // --- EVENTOS ---
    getManualBtn.addEventListener('click', () => {
        const date = dateInput.value;
        const time = timeInput.value;
        if (!date || !time) return alert('Please select date and time.');
        fetchData(selectedLat, selectedLon, date, time);
    });
    
    map.on('click', (e) => {
        selectedLat = e.latlng.lat;
        selectedLon = e.latlng.lng;
        if (marker) map.removeLayer(marker);
        marker = L.marker(e.latlng).addTo(map);
    });

    async function handleSearch() {
        const placeName = searchInput.value.trim();
        if (placeName === '') return alert('Enter a place name to search.');
        searchBtn.textContent = 'Searching...';
        searchBtn.disabled = true;
        try {
            const response = await fetch('/api/search_location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ place_name: placeName })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Place not found.');
            }
            const data = await response.json();
            selectedLat = data.latitude;
            selectedLon = data.longitude;
            if (marker) map.removeLayer(marker);
            map.setView([selectedLat, selectedLon], 13);
            marker = L.marker([selectedLat, selectedLon]).addTo(map).bindPopup(data.place_name).openPopup();
        } catch (error) {
            alert(error.message);
        } finally {
            searchBtn.textContent = 'Search';
            searchBtn.disabled = false;
        }
    }

    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    document.getElementById('cancel-agenda-btn').addEventListener('click', closeAgendaModal);
    document.getElementById('save-agenda-btn').addEventListener('click', saveAgendaEvent);
    agendaModal.addEventListener('click', (e) => {
        if (e.target === agendaModal) closeAgendaModal();
    });

    dateInput.value = new Date().toISOString().split('T')[0];
});


// --- CHATBOT ---
document.addEventListener('DOMContentLoaded', () => {
    const chatbotToggler = document.querySelector(".chatbot-toggler");
    const chatInput = document.querySelector(".chat-input textarea");
    const sendChatBtn = document.getElementById("send-chat-btn");
    const chatbox = document.querySelector(".chatbox");

    if (!chatbotToggler || !chatInput || !sendChatBtn || !chatbox) {
        console.warn("Chatbot elements not found. Make sure the HTML is correct.");
        return;
    }

    const createChatLi = (message, className) => {
        const chatLi = document.createElement("li");
        chatLi.classList.add("chat", className);
        let chatContent = className === "outgoing" ? `<p>${message}</p>` : `<span>🤖</span><p></p>`;
        chatLi.innerHTML = chatContent;
        if (className === "incoming") {
            const p = chatLi.querySelector("p");
            p.textContent = message;
        }
        return chatLi;
    }

    const handleChat = async () => {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        chatInput.value = "";
        chatbox.appendChild(createChatLi(userMessage, "outgoing"));
        chatbox.scrollTo(0, chatbox.scrollHeight);

        const incomingChatLi = createChatLi("...", "incoming");
        chatbox.appendChild(incomingChatLi);
        chatbox.scrollTo(0, chatbox.scrollHeight);

        try {
            const response = await fetch("/api/chatbot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage }),
            });
            const data = await response.json();

            const thinkingP = incomingChatLi.querySelector("p");
            thinkingP.textContent = data.response;

            if (data.redirect_url) {
                setTimeout(() => {
                    window.location.href = data.redirect_url;
                }, 1200);
            }

        } catch (error) {
            const thinkingP = incomingChatLi.querySelector("p");
            thinkingP.textContent = "Oops! Something went wrong. Please try again.";
            console.error("Error contacting chatbot:", error);
        } finally {
            chatbox.scrollTo(0, chatbox.scrollHeight);
        }
    }

    sendChatBtn.addEventListener("click", handleChat);
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleChat();
        }
    });

    chatbotToggler.addEventListener("click", () => document.body.classList.toggle("show-chatbot"));
    const closeBtn = document.querySelector(".chatbot header .close-btn");
    if (closeBtn) {
       closeBtn.addEventListener("click", () => document.body.classList.remove("show-chatbot"));
    }
});
