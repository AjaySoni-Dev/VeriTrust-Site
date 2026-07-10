// Sticky Header Effect
        const header = document.getElementById('header');
        window.addEventListener('scroll', () => {
            if (window.scrollY > 10) {
                header.style.borderBottom = '1px solid var(--border-hover)';
                header.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
            } else {
                header.style.borderBottom = '1px solid var(--border-subtle)';
                header.style.boxShadow = 'none';
            }
        });

        // Scroll Reveal Animations
        const revealElements = document.querySelectorAll('.reveal');
        
        const revealOptions = {
            threshold: 0.1,
            rootMargin: "0px 0px -30px 0px"
        };

        const revealOnScroll = new IntersectionObserver(function(entries, observer) {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            });
        }, revealOptions);

        revealElements.forEach(el => {
            revealOnScroll.observe(el);
        });

        // Animated Counters
        const counters = document.querySelectorAll('.counter');
        const speed = 100;

        const counterObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const counter = entry.target;
                    const updateCount = () => {
                        const target = +counter.getAttribute('data-target');
                        const count = +counter.innerText.replace(/,/g, '');
                        const inc = target / speed;

                        if (count < target) {
                            counter.innerText = Math.ceil(count + inc).toLocaleString();
                            setTimeout(updateCount, 25);
                        } else {
                            counter.innerText = target.toLocaleString();
                        }
                    };
                    updateCount();
                    observer.unobserve(counter);
                }
            });
        }, { threshold: 0.5 });

        counters.forEach(counter => {
            counterObserver.observe(counter);
        });

        // Mobile Menu Toggle
        const menuToggle = document.querySelector('.menu-toggle');
        const navLinks = document.querySelector('.nav-links');

        menuToggle.addEventListener('click', () => {
            const isVisible = navLinks.style.display === 'flex';
            if (isVisible) {
                navLinks.style.display = '';
                navLinks.style.position = '';
                navLinks.style.flexDirection = '';
                navLinks.style.background = '';
                navLinks.style.top = '';
                navLinks.style.left = '';
                navLinks.style.right = '';
                navLinks.style.padding = '';
                navLinks.style.borderBottom = '';
            } else {
                navLinks.style.display = 'flex';
                navLinks.style.flexDirection = 'column';
                navLinks.style.position = 'absolute';
                navLinks.style.top = '100%';
                navLinks.style.left = '0';
                navLinks.style.right = '0';
                navLinks.style.background = 'var(--bg-surface)';
                navLinks.style.padding = '1.5rem';
                navLinks.style.borderBottom = '1px solid var(--border-subtle)';
            }
        });
