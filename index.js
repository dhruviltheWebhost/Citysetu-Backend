chat: {
                isOpen: false,
                state: 'initial',
                // --- 1. IMPROVED: Added 'preferredWorker' ---
                bookingDetails: { name: "", phone: "", service: "", location: "", time: "", preferredWorker: null },
                elements: { bubble: document.getElementById('chat-bubble'), window: document.getElementById('chat-window'), headerClose: document.getElementById('chat-header-close'), messages: document.getElementById('chat-messages'), inputArea: document.getElementById('chat-input-area'), inputForm: document.getElementById('chat-input-form'), input: document.getElementById('chat-input'), optionsArea: document.getElementById('chat-options-area'), },
                init() { this.elements.bubble.addEventListener('click', () => this.open()); this.elements.headerClose.addEventListener('click', () => this.close()); this.elements.inputForm.addEventListener('submit', (e) => this.handleSubmit(e)); this.startChat(); },
                open() { if (this.isOpen) return; this.isOpen = true; gsap.to(this.elements.bubble, { opacity: 0, scale: 0.5, duration: 0.2, ease: 'power3.in' }); this.elements.window.style.visibility = 'visible'; gsap.to(this.elements.window, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power3.out' }); },
                close() { if (!this.isOpen) return; this.isOpen = false; gsap.to(this.elements.window, { opacity: 0, y: 20, scale: 0.95, duration: 0.3, ease: 'power3.in', onComplete: () => { this.elements.window.style.visibility = 'hidden'; } }); gsap.to(this.elements.bubble, { opacity: 1, scale: 1, duration: 0.3, delay: 0.2, ease: 'back.out(1.7)' }); },
                
                // --- 2. IMPROVED: This function is now much smarter ---
                openWithService(serviceName, workerName = null) {
                    // Manually reset the chat (don't call startChat)
                    this.state = 'initial';
                    this.bookingDetails = { name: "", phone: "", service: "", location: "", time: "", preferredWorker: null };
                    this.elements.messages.innerHTML = '';
                    this.elements.input.disabled = true;
                    this.elements.optionsArea.innerHTML = '';

                    // Set the pre-filled details
                    this.bookingDetails.service = serviceName;
                    this.bookingDetails.preferredWorker = workerName; // Save the worker!

                    // Create the intro message
                    let introMessage = `I need the <strong>${serviceName}</strong> service.`;
                    if (workerName) {
                        introMessage = `Hi! I'd like to book <strong>${workerName}</strong> for <strong>${serviceName}</strong>.`;
                    }
                    this.addMessage(introMessage, 'user');

                    // Skip straight to asking for the name
                    this.state = 'awaiting_name';
                    this.showTypingAndReply("Great! What is your full name?", 1500, () => {
                        this.elements.input.disabled = false;
                        this.elements.input.placeholder = "Type your name...";
                        this.elements.input.focus();
                    });
                    this.open();
                },

                // --- 3. IMPROVED: Added 'preferredWorker' to the reset ---
                startChat() { this.state = 'initial'; this.bookingDetails = { name: "", phone: "", service: "", location: "", time: "", preferredWorker: null }; this.elements.messages.innerHTML = ''; this.elements.input.placeholder = "Type your message..."; this.elements.input.disabled = true; this.elements.optionsArea.innerHTML = ''; this.showTypingAndReply("👋 Hi! Welcome to CitySetu.", 500, () => { this.showTypingAndReply("What service do you need?", 1200, () => { this.showServiceOptions(); this.state = 'awaiting_service'; }); }); },
                handleSubmit(e) { e.preventDefault(); const userInput = this.elements.input.value.trim(); if (!userInput) return; this.addMessage(userInput, 'user'); this.elements.input.value = ''; this.handleReply(userInput, userInput); },
                handleOptionClick(value, text) { this.addMessage(text, 'user'); this.elements.optionsArea.innerHTML = ''; this.handleReply(value, text); },
                handleReply(value, text) { this.elements.input.disabled = true; this.elements.input.placeholder = "Please wait..."; switch (this.state) { case 'awaiting_service': this.bookingDetails.service = text; this.state = 'awaiting_name'; this.showTypingAndReply("Got it! What is your full name?", 1500, () => { this.elements.input.disabled = false; this.elements.input.placeholder = "Type your name..."; this.elements.input.focus(); }); break; case 'awaiting_name': this.bookingDetails.name = value; this.state = 'awaiting_phone'; this.showTypingAndReply(`Thanks, ${value}. What's your mobile number?`, 1500, () => { this.elements.input.disabled = false; this.elements.input.placeholder = "Type your 10-digit number..."; this.elements.input.focus(); }); break; case 'awaiting_phone': this.bookingDetails.phone = value; this.state = 'awaiting_location'; this.showTypingAndReply("Please share your location (e.g., Gota, Vastrapur).", 1500, () => { this.elements.input.disabled = false; this.elements.input.placeholder = "Type your location..."; this.elements.input.focus(); }); break; case 'awaiting_location': this.bookingDetails.location = value; this.state = 'awaiting_time'; this.showTypingAndReply("When do you need the service? (e.g., 'Today ASAP', 'Tomorrow 4 PM')", 1500, () => { this.elements.input.disabled = false; this.elements.input.placeholder = "Type your preferred time..."; this.elements.input.focus(); }); break;
                    // --- 4. IMPROVED: Summary message now shows the worker ---
                    case 'awaiting_time':
                        this.bookingDetails.time = value;
                        this.state = 'awaiting_confirmation';
                        // Build the summary message dynamically
                        let summary = `Great! Here's your booking summary:<br>
                            <strong>Name:</strong> ${this.bookingDetails.name}<br>
                            <strong>Phone:</strong> ${this.bookingDetails.phone}<br>
                            <strong>Service:</strong> ${this.bookingDetails.service}`;
                        
                        if (this.bookingDetails.preferredWorker) {
                            summary += `<br><strong>Preferred Worker:</strong> ${this.bookingDetails.preferredWorker}`;
                        }

                        summary += `<br><strong>Location:</strong> ${this.bookingDetails.location}<br>
                            <strong>Time:</strong> ${this.bookingDetails.time}<br><br>
                            Do you want to confirm this booking?`;

                        this.showTypingAndReply(summary, 2000, () => {
                            this.showConfirmationOptions();
                        });
                        break;
                    // --- End of improved summary ---
                    case 'awaiting_confirmation': if (value === 'yes') { this.confirmBooking(); } else { this.showTypingAndReply("No problem! Let's start over.", 1000, () => { this.startChat(); }); } break; default: this.showTypingAndReply("I'm sorry, I'm just a simple bot. I can only help with booking.", 1500, () => { this.reAskCurrentQuestion(); }); break; } },
                reAskCurrentQuestion() { this.elements.input.disabled = true; this.elements.input.placeholder = "Please wait..."; if (this.state === 'awaiting_service') { this.showTypingAndReply("What service do you need?", 1000, () => this.showServiceOptions()); } else if (this.state === 'awaiting_name') { this.showTypingAndReply("What is your full name?", 1000, () => { this.elements.input.disabled = false; this.elements.input.placeholder = "Type your name..."; }); } },
                addMessage(text, sender = 'bot', onComplete = null) { const msgEl = document.createElement('div'); msgEl.classList.add('chat-message', sender); msgEl.innerHTML = text; this.elements.messages.appendChild(msgEl); gsap.to(msgEl, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', onComplete: () => { this.elements.messages.scrollTop = this.elements.messages.scrollHeight; if (onComplete) onComplete(); } }); },
                showTypingAndReply(replyText, delay, onComplete) { const typingEl = document.createElement('div'); typingEl.classList.add('chat-message', 'typing-indicator'); typingEl.innerHTML = '<span></span><span></span><span></span>'; this.elements.messages.appendChild(typingEl); this.elements.messages.scrollTop = this.elements.messages.scrollHeight; setTimeout(() => { typingEl.remove(); this.addMessage(replyText, 'bot', onComplete); }, delay); },
                showServiceOptions() { this.elements.input.disabled = true; this.elements.input.placeholder = "Please select an option above"; this.elements.optionsArea.innerHTML = `<button class="chat-option-btn" onclick="app.chat.handleOptionClick('Laptop Repair', 'Laptop Repair')">💻 Laptop Repair</button> <button class="chat-option-btn" onclick="app.chat.handleOptionClick('AC Repair', 'AC Repair')">❄️ AC Repair</button> <button class="chat-option-btn" onclick="app.chat.handleOptionClick('Electrician', 'Electrician')">💡 Electrician</button> <button class="chat-option-btn" onclick="app.chat.handleOptionClick('Home Repair', 'Home Repair')">🔨 Home Repair</button> <button class="chat-option-btn" onclick="app.chat.handleOptionClick('Cleaning', 'Cleaning')">🧹 Cleaning</button>`; },
                showConfirmationOptions() { this.elements.input.disabled = true; this.elements.input.placeholder = "Please confirm above"; this.elements.optionsArea.innerHTML = `<button class="chat-option-btn" onclick="app.chat.handleOptionClick('yes', 'Yes, confirm booking')">✅ Yes, Confirm</button> <button class="chat-option-btn" onclick="app.chat.handleOptionClick('no', 'No, cancel')">❌ No, Cancel</button>`; },
                // --- 5. NO CHANGE NEEDED HERE ---
                confirmBooking() { this.elements.inputArea.style.display = 'none'; this.elements.optionsArea.style.display = 'none'; this.elements.messages.innerHTML += `<div id="success-animation"> <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"> <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/> <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/> </svg> <p class.="font-semibold text-lg mt-4" style="color: ${app.getBrandColor('navy')}">Booking Received!</p> <p class="text-gray-600">Our verified team will confirm shortly.</p> </div>`; app.logToSheet('chat', this.bookingDetails); setTimeout(() => { this.elements.inputArea.style.display = 'flex'; this.elements.optionsArea.style.display = 'block'; this.startChat(); }, 5000); }
            },
