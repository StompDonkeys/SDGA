fetch('putting-data.json')
    .then(response => response.json())
    .then(data => {
        if (data.length === 0) {
            document.getElementById('no-data-message').style.display = 'block';
        } else {
            // Sort data by date
            data.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Populate the table
            const tbody = document.getElementById('putting-table-body');
            data.forEach(entry => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${entry.date}</td>
                    <td>${entry.made}</td>
                    <td>${(entry.made / 50 * 100).toFixed(2)}%</td>
                `;
                tbody.appendChild(row);
            });

            // Prepare chart data
            const labels = data.map(entry => entry.date);
            const madePutts = data.map(entry => entry.made);
            let cumulativeSum = 0;
            const averages = data.map((entry, index) => {
                cumulativeSum += entry.made;
                return cumulativeSum / (index + 1);
            });

            // Create the chart
            const ctx = document.getElementById('putting-chart').getContext('2d');
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Made Putts',
                            data: madePutts,
                            backgroundColor: 'rgba(255, 193, 7, 0.6)', // #FFC107 with opacity
                            borderColor: '#FFC107',
                            borderWidth: 1
                        },
                        {
                            label: 'Average',
                            data: averages,
                            type: 'line',
                            backgroundColor: 'rgba(255, 202, 40, 0.6)', // #FFCA28 with opacity
                            borderColor: '#FFCA28',
                            borderWidth: 2,
                            fill: false
                        }
                    ]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 50,
                            title: {
                                display: true,
                                text: 'Number of Putts'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Date'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true
                        }
                    }
                }
            });
        }
    })
    .catch(error => {
        console.error('Error loading putting data:', error);
        document.getElementById('no-data-message').textContent = 'Error loading data.';
        document.getElementById('no-data-message').style.display = 'block';
    });
​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​
